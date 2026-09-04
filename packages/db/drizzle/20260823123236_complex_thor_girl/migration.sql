CREATE TABLE "end_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"label" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "triggered_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "external_subject_id" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "external_subject_id" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "trigger_payload" jsonb;--> statement-breakpoint
CREATE INDEX "executions_workspace_subject_created_idx" ON "executions" ("workspace_id","external_subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "end_subjects_workspace_external_id_uidx" ON "end_subjects" ("workspace_id","external_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_triggered_by_user_id_users_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "end_subjects" ADD CONSTRAINT "end_subjects_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;