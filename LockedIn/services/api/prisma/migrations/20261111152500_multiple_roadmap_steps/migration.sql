-- Restore proposals that the original single-step workflow automatically
-- superseded. In the roadmap workflow, independent proposals remain pending
-- until the other partner accepts each one as its own next step.
UPDATE "SharedNextStep" AS step
SET "status" = 'PROPOSED'
WHERE step."status" IN ('REVISED', 'DECLINED')
  AND NOT EXISTS (
    SELECT 1
    FROM "Reflection" AS reflection
    WHERE reflection."nextStepId" = step."id"
  );
