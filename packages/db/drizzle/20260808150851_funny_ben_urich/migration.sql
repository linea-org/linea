ALTER TABLE "execution_steps" ADD COLUMN "is_system_event" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- idempotencyKey, not nodeId, is what actually distinguishes a resume marker from every real
-- step ever written: checkpoints.service.ts's recordStep sets it unconditionally to
-- `${executionId}:${nodeId}` for every real step, and recordResumeEvent has never set it at
-- all. These are the only two code paths that have ever inserted into execution_steps, so
-- "idempotency_key is null" holds for every historical resume marker and for nothing else —
-- unlike nodeId, a real step can never produce a false match here, including a legacy step a
-- workflow happened to name '__resumed__' before that id was reserved. The nodeId check is
-- kept as a redundant, belt-and-suspenders condition: both are true for every real resume
-- marker, so it costs nothing and narrows the match further.
UPDATE "execution_steps" SET "is_system_event" = true
WHERE "idempotency_key" IS NULL AND "node_id" = '__resumed__';