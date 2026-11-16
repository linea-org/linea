CREATE TYPE "template_appeal_status" AS ENUM('open', 'upheld', 'rejected');--> statement-breakpoint
CREATE TYPE "template_appeal_type" AS ENUM('not_a_violation', 'credentials_rotated', 'reported_in_bad_faith', 'automatic_hide_review', 'other');--> statement-breakpoint
ALTER TYPE "template_moderation_action" ADD VALUE 'appeal';--> statement-breakpoint
ALTER TYPE "template_moderation_action" ADD VALUE 'appeal_upheld';--> statement-breakpoint
ALTER TYPE "template_moderation_action" ADD VALUE 'appeal_rejected';--> statement-breakpoint
CREATE TABLE "workflow_template_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"appellant_id" uuid,
	"type" "template_appeal_type" NOT NULL,
	"message" text,
	"status" "template_appeal_status" DEFAULT 'open'::"template_appeal_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_template_appeals_one_open_uidx" ON "workflow_template_appeals" ("template_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "workflow_template_appeals_status_created_idx" ON "workflow_template_appeals" ("status","created_at");--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_j5LduEan5Smk_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_appellant_id_users_id_fkey" FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_decided_by_users_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL;