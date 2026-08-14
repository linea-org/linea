ALTER TABLE "workflows" ADD COLUMN "draft_graph" jsonb;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "draft_updated_at" timestamp with time zone;