BEGIN;

-- This private account choice blocks all of the account's shared spaces.
ALTER TABLE public."user" ADD COLUMN "togetherReportingOptedOutAt" TIMESTAMP(3);

-- The pilot still starts from the explicit enrollment list. A stale enrollment
-- can't count after either partner withdraws, and a space must have two members.
CREATE OR REPLACE FUNCTION lockedin_reporting.weekly_together_report(report_week DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $report$
  WITH calendar AS (
    SELECT statement_timestamp() AT TIME ZONE 'UTC' AS now_at,
      date_trunc('week', statement_timestamp() AT TIME ZONE 'UTC')::date AS current_week
  ), chosen AS (
    SELECT COALESCE(report_week, current_week - 7) AS week_start, current_week, now_at
    FROM calendar
  ), report_window AS (
    SELECT week_start, week_start + 7 AS week_end, now_at FROM chosen
    WHERE extract(isodow FROM week_start) = 1
      AND week_start BETWEEN current_week - 364 AND current_week - 7
  ), cohort AS (
    SELECT pair.relationship_id, pair.enrolled_at
    FROM lockedin_reporting.pilot_pair pair
    JOIN public."RelationshipMember" member ON member."relationshipId" = pair.relationship_id
    JOIN public."user" account ON account.id = member."userId"
    CROSS JOIN report_window w
    WHERE pair.enrolled_at < w.week_end
    GROUP BY pair.relationship_id, pair.enrolled_at
    HAVING count(*) = 2 AND bool_and(account."togetherReportingOptedOutAt" IS NULL)
  ), cohort_count AS (
    SELECT count(*) AS n FROM cohort
  ), weekly_plans AS (
    SELECT plan.id, plan."relationshipId" AS pair_id,
      (plan."createdAt" >= greatest(w.week_start, c.enrolled_at) AND plan."createdAt" < w.week_end) AS proposed,
      (plan."acceptedAt" >= greatest(w.week_start, c.enrolled_at) AND plan."acceptedAt" < w.week_end) AS accepted,
      (plan.status = 'DONE' AND plan."completedAt" >= greatest(w.week_start, c.enrolled_at)
        AND plan."completedAt" < w.week_end) AS completed
    FROM report_window w CROSS JOIN cohort c
    JOIN public."RoadmapPlan" plan ON plan."relationshipId" = c.relationship_id
  ), linked_memories AS (
    SELECT photo."relationshipId" AS pair_id, photo."sourcePlanId" AS plan_id,
      photo."createdAt" AS saved_at, partner.first_detail_at
    FROM report_window w CROSS JOIN cohort c
    JOIN public."TogetherPhoto" photo ON photo."relationshipId" = c.relationship_id
      AND photo."sourcePlanId" IS NOT NULL AND photo."createdAt" >= c.enrolled_at AND photo."createdAt" <= w.now_at
    LEFT JOIN LATERAL (
      SELECT min(note."createdAt") AS first_detail_at
      FROM public."TogetherPhotoPin" pin
      JOIN public."TogetherPhotoNote" note ON note."pinId" = pin.id
      WHERE pin."photoId" = photo.id AND note."authorId" <> photo."uploaderId"
        AND note."createdAt" >= photo."createdAt" AND note."createdAt" <= w.now_at
    ) partner ON true
  ), shared_pairs AS (
    SELECT pair_id FROM weekly_plans WHERE accepted
    UNION
    SELECT pair_id FROM linked_memories CROSS JOIN report_window w
    WHERE first_detail_at >= w.week_start AND first_detail_at < w.week_end
  ), completed_with_memory AS (
    SELECT memory.first_detail_at FROM weekly_plans plan
    JOIN linked_memories memory ON memory.plan_id = plan.id AND memory.pair_id = plan.pair_id
    CROSS JOIN report_window w
    WHERE plan.completed AND memory.saved_at < w.week_end
  ), first_shared AS (
    SELECT pair_id, min(first_detail_at) AS first_at
    FROM linked_memories WHERE first_detail_at IS NOT NULL GROUP BY pair_id
  ), observable AS (
    SELECT pair_id, first_at FROM first_shared CROSS JOIN report_window w
    WHERE first_at >= w.week_start AND first_at < w.week_end
      AND first_at + INTERVAL '30 days' <= w.now_at
  )
  SELECT jsonb_build_object('weekStart', w.week_start, 'weekEndExclusive', w.week_end, 'timeZone', 'UTC')
    || CASE WHEN c.n < 5 THEN jsonb_build_object('status', 'insufficient_cohort')
    ELSE jsonb_build_object(
      'status', 'ok', 'enrolledPairs', c.n,
      'pairsWithSharedAction', (SELECT count(*) FROM shared_pairs),
      'plansProposed', (SELECT count(*) FROM weekly_plans WHERE proposed),
      'plansAccepted', (SELECT count(*) FROM weekly_plans WHERE accepted),
      'plansMarkedDone', (SELECT count(*) FROM weekly_plans WHERE completed),
      'savedMemories', (SELECT count(*) FROM completed_with_memory),
      'memoriesWithBothPeople', (SELECT count(*) FROM completed_with_memory WHERE first_detail_at < w.week_end),
      'repeatMemories', CASE WHEN (SELECT count(*) FROM observable) < 5
        THEN jsonb_build_object('status', 'insufficient_follow_up')
        ELSE jsonb_build_object('status', 'ok',
          'pairsWithFullFollowUp', (SELECT count(*) FROM observable),
          'pairsWithAnotherSharedMemory', (SELECT count(*) FROM observable o WHERE EXISTS (
            SELECT 1 FROM linked_memories m WHERE m.pair_id = o.pair_id
              AND m.first_detail_at BETWEEN o.first_at + INTERVAL '7 days' AND o.first_at + INTERVAL '30 days'
          ))
        ) END
    ) END
  FROM report_window w CROSS JOIN cohort_count c;
$report$;

REVOKE ALL ON FUNCTION lockedin_reporting.weekly_together_report(DATE) FROM PUBLIC;

COMMIT;
