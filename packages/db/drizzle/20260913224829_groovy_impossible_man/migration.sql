CREATE TYPE "public_idempotency_actor_kind" AS ENUM('application_key', 'end_user_session');--> statement-breakpoint
CREATE TABLE "public_idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"actor_kind" "public_idempotency_actor_kind" NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "external_subject_record_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "public_idempotency_actor_operation_key_uidx" ON "public_idempotency_records" ("actor_kind","actor_id","operation","idempotency_key");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_external_subject_fkey" FOREIGN KEY ("external_subject_record_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id");--> statement-breakpoint
ALTER TABLE "public_idempotency_records" ADD CONSTRAINT "public_idempotency_records_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;