CREATE TYPE "outbox_event_type" AS ENUM('execution.completed', 'execution.failed', 'approval_request.created', 'approval_request.decided', 'approval_request.cancelled', 'action_intent.executed', 'action_intent.failed', 'connection.revoked');--> statement-breakpoint
CREATE TYPE "outbox_message_kind" AS ENUM('workflow_execution', 'public_event');--> statement-breakpoint
CREATE TYPE "outbox_message_status" AS ENUM('pending', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid,
	"external_subject_id" uuid,
	"kind" "outbox_message_kind" NOT NULL,
	"event_type" "outbox_event_type",
	"payload" jsonb NOT NULL,
	"status" "outbox_message_status" DEFAULT 'pending'::"outbox_message_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"claimed_by" text,
	"published_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_messages_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "outbox_messages_payload_check" CHECK (jsonb_typeof("payload") = 'object' AND octet_length("payload"::text) <= 65536),
	CONSTRAINT "outbox_messages_kind_check" CHECK (("kind" = 'workflow_execution' AND "application_id" IS NULL AND "external_subject_id" IS NULL AND "event_type" IS NULL) OR ("kind" = 'public_event' AND "application_id" IS NOT NULL AND "event_type" IS NOT NULL)),
	CONSTRAINT "outbox_messages_claim_check" CHECK (("status" = 'publishing') = ("claimed_at" IS NOT NULL AND "claim_expires_at" IS NOT NULL AND "claimed_by" IS NOT NULL)),
	CONSTRAINT "outbox_messages_terminal_check" CHECK (("status" = 'published') = ("published_at" IS NOT NULL) AND ("status" = 'failed') = ("failed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "outbox_messages_dispatch_idx" ON "outbox_messages" ("kind","status","available_at","claim_expires_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_application_subject_created_idx" ON "outbox_messages" ("application_id","external_subject_id","created_at","id");--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_application_subject_fkey" FOREIGN KEY ("application_id","external_subject_id") REFERENCES "external_subject_applications"("application_id","external_subject_id") ON DELETE CASCADE;