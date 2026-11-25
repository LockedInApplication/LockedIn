BEGIN;

-- Independent of the Together pilot. No existing account is enrolled.
-- Supply the time a member agreed to this specific reporting purpose.
CREATE TABLE lockedin_reporting.weekly_app_permission (
  user_id TEXT PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  granted_at TIMESTAMP(3) NOT NULL
);
REVOKE ALL ON TABLE lockedin_reporting.weekly_app_permission FROM PUBLIC;

CREATE FUNCTION lockedin_reporting.weekly_lockedin_report(report_week DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $report$
  WITH calendar AS (
    SELECT statement_timestamp() AT TIME ZONE 'UTC' AS now_at,
      date_trunc('week', statement_timestamp() AT TIME ZONE 'UTC')::date AS this_week
  ), periods AS (
    SELECT COALESCE(report_week, this_week - 7) AS week_start, this_week, now_at
    FROM calendar
  ), report_window AS (
    SELECT week_start, week_start + 7 AS week_end,
      now_at >= week_start + 14 AS first_ready,
      now_at >= week_start + 21 AS repeat_ready
    FROM periods
    WHERE extract(isodow FROM week_start) = 1
      AND week_start BETWEEN this_week - 364 AND this_week - 7
  ), accounts AS (
    SELECT count(*) AS signups, count(*) FILTER (WHERE u."emailVerified") AS verified
    FROM report_window w
    JOIN public."user" u ON u."createdAt" >= w.week_start AND u."createdAt" < w.week_end
    JOIN lockedin_reporting.weekly_app_permission p ON p.user_id = u.id AND p.granted_at <= u."createdAt"
  ), accepted AS (
    SELECT 'discover' AS route, d."userLowId" AS low_id, d."userHighId" AS high_id,
      d."acceptedAt" AS accepted_at, c.id AS conversation_id,
      coalesce(least(d."lockedInAt", r."directLockedInAt"), 'infinity'::timestamp) AS inbox_until
    FROM report_window w
    JOIN public."DiscoveryConnection" d ON d."acceptedAt" >= w.week_start AND d."acceptedAt" < w.week_end
    LEFT JOIN public."ChatConversation" c ON c."discoveryConnectionId" = d.id AND c.origin = 'DISCOVERY'
      AND c."userLowId" = d."userLowId" AND c."userHighId" = d."userHighId"
    LEFT JOIN public."Relationship" r ON r.id = c."relationshipId"
    UNION ALL
    SELECT 'direct', least(i."inviterId", i."inviteeId"), greatest(i."inviterId", i."inviteeId"),
      i."acceptedAt", c.id, coalesce(r."directLockedInAt", 'infinity'::timestamp)
    FROM report_window w
    JOIN public."RelationshipInvite" i ON i."acceptedAt" >= w.week_start AND i."acceptedAt" < w.week_end
      AND i."inviteeId" IS NOT NULL
    -- Reusing a Discover chat can count as a direct acceptance but not a new direct chat.
    LEFT JOIN public."ChatConversation" c ON c."directInvitationId" = i.id AND c.origin = 'DIRECT_INVITATION'
      AND ((c."userLowId" = i."inviterId" AND c."userHighId" = i."inviteeId")
        OR (c."userLowId" = i."inviteeId" AND c."userHighId" = i."inviterId"))
    LEFT JOIN public."Relationship" r ON r.id = c."relationshipId"
  ), permitted AS (
    SELECT a.*
    FROM accepted a
    JOIN lockedin_reporting.weekly_app_permission low ON low.user_id = a.low_id AND low.granted_at <= a.accepted_at
    JOIN lockedin_reporting.weekly_app_permission high ON high.user_id = a.high_id AND high.granted_at <= a.accepted_at
    WHERE a.low_id <> a.high_id
  ), first_exchanges AS (
    SELECT p.*,
      CASE WHEN first.low_at IS NOT NULL AND first.high_at IS NOT NULL
        THEN greatest(first.low_at, first.high_at) END AS first_at
    FROM permitted p CROSS JOIN report_window w
    LEFT JOIN LATERAL (
      SELECT min(m."createdAt") FILTER (WHERE m."senderId" = p.low_id) AS low_at,
        min(m."createdAt") FILTER (WHERE m."senderId" = p.high_id) AS high_at
      FROM public."DiscoveryMessage" m
      WHERE w.first_ready AND m."conversationId" = p.conversation_id
        AND m."createdAt" >= p.accepted_at AND m."createdAt" < p.accepted_at + INTERVAL '7 days'
        AND m."createdAt" < p.inbox_until
        AND m."datePlanEvent" IS NULL AND m."dateSpotPlaceId" IS NULL
    ) first ON true
  ), exchanges AS (
    SELECT f.*,
      (SELECT count(DISTINCT m."senderId") = 2 FROM public."DiscoveryMessage" m
       WHERE w.repeat_ready AND m."conversationId" = f.conversation_id
         AND m."senderId" IN (f.low_id, f.high_id)
         AND m."createdAt" >= date_trunc('day', f.first_at) + INTERVAL '1 day'
         AND m."createdAt" < least(f.first_at + INTERVAL '7 days', f.inbox_until)
         AND f.first_at IS NOT NULL
         AND m."datePlanEvent" IS NULL AND m."dateSpotPlaceId" IS NULL) AS repeated
    FROM first_exchanges f CROSS JOIN report_window w
  ), counts AS (
    SELECT a.route, count(e.route) AS accepted,
      count(DISTINCT (e.low_id, e.high_id)) FILTER (WHERE e.route IS NOT NULL) AS pairs,
      count(e.first_at) AS first_chats,
      count(DISTINCT (e.low_id, e.high_id)) FILTER (WHERE e.first_at IS NOT NULL) AS first_pairs,
      count(*) FILTER (WHERE e.repeated) AS repeats,
      count(DISTINCT (e.low_id, e.high_id)) FILTER (WHERE e.repeated) AS repeat_pairs
    FROM (VALUES ('discover'), ('direct')) AS a(route)
    LEFT JOIN exchanges e ON e.route = a.route
    GROUP BY a.route
  ), safe_counts AS (
    -- Complementary suppression: subtracting adjacent totals must not expose a small group.
    SELECT c.*, w.first_ready AND c.pairs >= 5 AND c.first_pairs NOT BETWEEN 1 AND 4
      AND c.pairs - c.first_pairs NOT BETWEEN 1 AND 4
      AND c.accepted - c.first_chats NOT BETWEEN 1 AND 4 AS show_first
    FROM counts c CROSS JOIN report_window w
  ), paths AS (
    SELECT c.route, jsonb_build_object(
      'acceptedInvites', CASE WHEN c.pairs >= 5 THEN c.accepted END,
      'firstTwoWayChats', CASE WHEN c.show_first THEN c.first_chats END,
      'repeatTwoWayChats', CASE WHEN w.repeat_ready AND c.show_first AND c.first_pairs >= 5
        AND c.repeat_pairs NOT BETWEEN 1 AND 4 AND c.first_pairs - c.repeat_pairs NOT BETWEEN 1 AND 4
        AND c.first_chats - c.repeats NOT BETWEEN 1 AND 4
        THEN c.repeats END
    ) AS totals
    FROM safe_counts c CROSS JOIN report_window w
  )
  SELECT jsonb_build_object(
    'weekStart', w.week_start, 'weekEndExclusive', w.week_end, 'timeZone', 'UTC',
    'firstChatsReady', w.first_ready, 'repeatChatsReady', w.repeat_ready,
    'accounts', jsonb_build_object(
      'signups', CASE WHEN a.signups >= 5 THEN a.signups END,
      'verifiedAccounts', CASE WHEN a.signups >= 5 AND a.verified NOT BETWEEN 1 AND 4
        AND a.signups - a.verified NOT BETWEEN 1 AND 4 THEN a.verified END),
    'discover', (SELECT totals FROM paths WHERE route = 'discover'),
    'directInvites', (SELECT totals FROM paths WHERE route = 'direct')
  )
  FROM report_window w CROSS JOIN accounts a;
$report$;

REVOKE ALL ON FUNCTION lockedin_reporting.weekly_lockedin_report(DATE) FROM PUBLIC;

COMMIT;
