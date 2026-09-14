CREATE TYPE "approval_decision_actor_kind" AS ENUM('workspace_member', 'external_subject', 'system');--> statement-breakpoint
CREATE TYPE "approval_decision_outcome" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "approval_decision_reason" AS ENUM('human', 'timeout');--> statement-breakpoint
ALTER TYPE "approval_status" RENAME TO "approval_request_status";--> statement-breakpoint
TRUNCATE TABLE "approvals";--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"outcome" "approval_decision_outcome" NOT NULL,
	"actor_kind" "approval_decision_actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"actor_external_subject_id" uuid,
	"end_user_session_id" uuid,
	"reason" "approval_decision_reason" NOT NULL,
	"comment" text,
	"idempotency_key" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decisions_actor_check" CHECK (("actor_kind" = 'workspace_member' AND "actor_user_id" IS NOT NULL AND "actor_external_subject_id" IS NULL AND "end_user_session_id" IS NULL) OR ("actor_kind" = 'external_subject' AND "actor_user_id" IS NULL AND "actor_external_subject_id" IS NOT NULL AND "end_user_session_id" IS NOT NULL) OR ("actor_kind" = 'system' AND "actor_user_id" IS NULL AND "actor_external_subject_id" IS NULL AND "end_user_session_id" IS NULL)),
	CONSTRAINT "approval_decisions_reason_check" CHECK (("actor_kind" = 'system' AND "reason" = 'timeout') OR ("actor_kind" <> 'system' AND "reason" = 'human')),
	CONSTRAINT "approval_decisions_comment_size_check" CHECK ("comment" IS NULL OR octet_length("comment") <= 2048),
	CONSTRAINT "approval_decisions_idempotency_key_check" CHECK ("idempotency_key" IS NULL OR char_length("idempotency_key") BETWEEN 1 AND 256)
);
--> statement-breakpoint
ALTER TABLE "approvals" RENAME TO "approval_requests";--> statement-breakpoint
ALTER TABLE "approval_requests" RENAME COLUMN "timeout_at" TO "expires_at";--> statement-breakpoint
ALTER TABLE "approval_requests" RENAME COLUMN "created_at" TO "requested_at";--> statement-breakpoint
ALTER INDEX "approvals_execution_node_uidx" RENAME TO "approval_requests_execution_node_uidx";--> statement-breakpoint
ALTER INDEX "approvals_workspace_status_idx" RENAME TO "approval_requests_workspace_status_idx";--> statement-breakpoint
ALTER INDEX "approvals_timeout_idx" RENAME TO "approval_requests_expiry_idx";--> statement-breakpoint
DROP INDEX "approval_requests_expiry_idx";--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "display" jsonb;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "action_intent_digest" text;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "workflow_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "display" SET NOT NULL;--> statement-breakpoint
DROP TYPE "approval_request_status";--> statement-breakpoint
CREATE TYPE "approval_request_status" AS ENUM('pending', 'decided', 'cancelled');--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "status" SET DATA TYPE "approval_request_status" USING "status"::"approval_request_status";--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "status" SET DEFAULT 'pending'::"approval_request_status";--> statement-breakpoint
CREATE INDEX "approval_requests_expiry_idx" ON "approval_requests" ("expires_at") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "message";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "responded_by";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "responded_by_external_subject_id";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "comment";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "responded_at";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "timed_out";--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "audience" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "external_subject_id" SET DATA TYPE uuid USING "external_subject_id"::uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "executions_id_workspace_workflow_uidx" ON "executions" ("id","workspace_id","workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_approval_subject_scope_uidx" ON "executions" ("id","workspace_id","workflow_id","application_id","external_subject_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_id_workspace_uidx" ON "approval_requests" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "approval_requests_subject_status_idx" ON "approval_requests" ("application_id","external_subject_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decisions_request_uidx" ON "approval_decisions" ("approval_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_application_subject_uidx" ON "conversations" ("id","application_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id") REFERENCES "executions"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_subject_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id","application_id","external_subject_id") REFERENCES "executions"("id","workspace_id","workflow_id","application_id","external_subject_record_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_external_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_application_fkey" FOREIGN KEY ("application_id","external_subject_id") REFERENCES "external_subject_applications"("application_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_conversation_owner_fkey" FOREIGN KEY ("conversation_id","application_id","external_subject_id") REFERENCES "conversations"("id","application_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_fkey" FOREIGN KEY ("approval_request_id","workspace_id") REFERENCES "approval_requests"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_external_subject_fkey" FOREIGN KEY ("actor_external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_session_fkey" FOREIGN KEY ("end_user_session_id","workspace_id") REFERENCES "end_user_sessions"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_audience_check" CHECK (("audience" = 'workspace' AND "external_subject_id" IS NULL) OR ("audience" = 'external_subject' AND "application_id" IS NOT NULL AND "external_subject_id" IS NOT NULL AND "approver_emails" IS NULL));--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_status_check" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_version_check" CHECK ("version" >= 1);--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_expiry_check" CHECK (("expires_at" IS NULL AND "timeout_action" IS NULL) OR ("expires_at" > "requested_at" AND "timeout_action" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_display_check" CHECK (jsonb_typeof("display") = 'object' AND jsonb_typeof("display"->'title') = 'string' AND char_length("display"->>'title') BETWEEN 1 AND 200 AND ("display"->'description' IS NULL OR jsonb_typeof("display"->'description') = 'string') AND ("display"->'details' IS NULL OR jsonb_typeof("display"->'details') = 'object') AND octet_length("display"::text) <= 8192);--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_action_intent_digest_check" CHECK ("action_intent_digest" IS NULL OR char_length("action_intent_digest") BETWEEN 1 AND 256);--> statement-breakpoint
CREATE FUNCTION prevent_approval_decision_mutation() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM approval_requests WHERE id = OLD.approval_request_id) THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'Approval Decisions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER approval_decisions_immutable
	BEFORE UPDATE OR DELETE ON "approval_decisions"
	FOR EACH ROW EXECUTE FUNCTION prevent_approval_decision_mutation();--> statement-breakpoint
CREATE FUNCTION prevent_approval_request_snapshot_mutation() RETURNS trigger AS $$
BEGIN
	IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
		OR OLD.application_id IS DISTINCT FROM NEW.application_id
		OR OLD.workflow_id IS DISTINCT FROM NEW.workflow_id
		OR OLD.execution_id IS DISTINCT FROM NEW.execution_id
		OR OLD.node_id IS DISTINCT FROM NEW.node_id
		OR OLD.audience IS DISTINCT FROM NEW.audience
		OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id
		OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
		OR OLD.display IS DISTINCT FROM NEW.display
		OR OLD.approver_emails IS DISTINCT FROM NEW.approver_emails
		OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
		OR OLD.timeout_action IS DISTINCT FROM NEW.timeout_action
		OR OLD.action_intent_digest IS DISTINCT FROM NEW.action_intent_digest
		OR OLD.requested_at IS DISTINCT FROM NEW.requested_at THEN
		RAISE EXCEPTION 'Approval Request snapshots are immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER approval_request_snapshots_immutable
	BEFORE UPDATE ON "approval_requests"
	FOR EACH ROW EXECUTE FUNCTION prevent_approval_request_snapshot_mutation();
