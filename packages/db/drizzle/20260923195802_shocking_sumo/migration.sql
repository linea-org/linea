CREATE TABLE "connection_read_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_read_uses_outcome_check" CHECK ("outcome" IN ('succeeded', 'failed')) -- Generated constraint literals mirror the schema; NOSONAR
);
--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD COLUMN "target_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD COLUMN "result_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ALTER COLUMN "end_user_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ALTER COLUMN "code_verifier_encrypted" DROP NOT NULL;--> statement-breakpoint
DELETE FROM "connection_authorization_requests" WHERE "completed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "connection_read_uses_owner_created_idx" ON "connection_read_uses" ("workspace_id","application_id","external_subject_id","connection_id","occurred_at","id");--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_connection_fkey" FOREIGN KEY ("connection_id","workspace_id") REFERENCES "connections"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_execution_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" DROP CONSTRAINT "connection_authorization_requests_session_fkey", ADD CONSTRAINT "connection_authorization_requests_session_fkey" FOREIGN KEY ("end_user_session_id") REFERENCES "end_user_sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('succeeded', 'failed'));--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_completion_check" CHECK (("completed_at" IS NULL AND "outcome" IS NULL AND "result_connection_id" IS NULL) OR ("completed_at" IS NOT NULL AND "outcome" = 'failed' AND "result_connection_id" IS NULL) OR ("completed_at" IS NOT NULL AND "outcome" = 'succeeded' AND "result_connection_id" IS NOT NULL));
