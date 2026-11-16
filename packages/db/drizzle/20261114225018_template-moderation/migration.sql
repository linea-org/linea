CREATE TYPE "workflow_template_moderation_status" AS ENUM('active', 'hidden');--> statement-breakpoint
CREATE TYPE "template_moderation_action" AS ENUM('auto_hide', 'hide', 'unhide', 'remove', 'dismiss_report');--> statement-breakpoint
CREATE TYPE "template_report_reason" AS ENUM('credentials', 'malicious', 'spam', 'inappropriate', 'other');--> statement-breakpoint
CREATE TYPE "template_report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid,
	"template_name" text NOT NULL,
	"author_workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" "template_moderation_action" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reporter_workspace_id" uuid NOT NULL,
	"reason" "template_report_reason" NOT NULL,
	"details" text,
	"status" "template_report_status" DEFAULT 'open'::"template_report_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text
);
--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "moderation_status" "workflow_template_moderation_status" DEFAULT 'active'::"workflow_template_moderation_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "moderated_by" uuid;--> statement-breakpoint
CREATE INDEX "workflow_template_moderation_events_template_idx" ON "workflow_template_moderation_events" ("template_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_template_reports_template_reporter_uidx" ON "workflow_template_reports" ("template_id","reporter_id");--> statement-breakpoint
CREATE INDEX "workflow_template_reports_status_created_idx" ON "workflow_template_reports" ("status","created_at");--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_moderated_by_users_id_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_moderation_events" ADD CONSTRAINT "workflow_template_moderation_events_wdsnbd7Zu8AI_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_moderation_events" ADD CONSTRAINT "workflow_template_moderation_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_w3CcSk5WCowB_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_0fhwKp66LzLj_fkey" FOREIGN KEY ("reporter_workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_resolved_by_users_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;