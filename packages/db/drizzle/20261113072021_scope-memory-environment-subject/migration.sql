-- Existing rows have no trusted Environment or End User; ADR 0022 allows dropping them.
TRUNCATE "memories";--> statement-breakpoint
DROP INDEX "memories_scope_key_uidx";--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "external_subject_record_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_scope_key_uniq" UNIQUE NULLS NOT DISTINCT("workspace_id","environment_id","external_subject_record_id","external_subject_id","namespace","key");--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_subject_fkey" FOREIGN KEY ("external_subject_record_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;