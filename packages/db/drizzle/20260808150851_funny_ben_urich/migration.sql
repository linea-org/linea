ALTER TABLE "execution_steps" ADD COLUMN "is_system_event" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Rows inserted before this column existed relied on nodeId alone to mark a resume event, so
-- nodeId is the only signal available to backfill from. This carries forward the exact same
-- ambiguity the old system had for any already-existing row: a real step a legacy workflow
-- happened to name '__resumed__' before that id was reserved is indistinguishable, after the
-- fact, from a genuine resume marker. Nothing recorded at insert time can resolve that for
-- historical rows; going forward, isSystemEvent is set directly by recordResumeEvent and never
-- derived from a workflow-supplied nodeId, so no new ambiguity can be introduced from here on.
UPDATE "execution_steps" SET "is_system_event" = true WHERE "node_id" = '__resumed__';