ALTER TYPE "audit_action" ADD VALUE 'approval_request.decided' BEFORE 'secret.created';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'approval_request.timed_out' BEFORE 'secret.created';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'approval_request.cancelled' BEFORE 'secret.created';--> statement-breakpoint
ALTER TYPE "audit_resource" ADD VALUE 'approval_request' BEFORE 'api_key';--> statement-breakpoint
ALTER TABLE "approval_decisions" DROP CONSTRAINT "approval_decisions_session_fkey";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_external_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_end_user_session_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_external_subject_id_external_subjects_id_fkey" FOREIGN KEY ("actor_external_subject_id") REFERENCES "external_subjects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_action_intent_digest_check", ADD CONSTRAINT "approval_requests_action_intent_digest_check" CHECK ("action_intent_digest" IS NULL OR (char_length("action_intent_digest") BETWEEN 1 AND 256 AND ("timeout_action" IS NULL OR "timeout_action" = 'auto_reject')));