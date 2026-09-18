CREATE TABLE "end_user_event_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "outbox_messages_application_subject_created_idx";--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "sequence" bigserial;--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_audience_uidx" ON "end_user_sessions" ("id","workspace_id","application_id","external_subject_id");--> statement-breakpoint
CREATE INDEX "end_user_event_streams_subject_lease_idx" ON "end_user_event_streams" ("application_id","external_subject_id","lease_expires_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_application_subject_sequence_idx" ON "outbox_messages" ("application_id","external_subject_id","sequence");--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_application_subject_fkey" FOREIGN KEY ("application_id","external_subject_id") REFERENCES "external_subject_applications"("application_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_session_fkey" FOREIGN KEY ("session_id","workspace_id","application_id","external_subject_id") REFERENCES "end_user_sessions"("id","workspace_id","application_id","external_subject_id") ON DELETE CASCADE;