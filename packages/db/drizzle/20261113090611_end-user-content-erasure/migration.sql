ALTER TABLE "executions" ADD COLUMN "content_erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "content_erased_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_approval_request_snapshot_mutation() RETURNS trigger AS $$
BEGIN
	IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
		OR OLD.environment_id IS DISTINCT FROM NEW.environment_id
		OR OLD.workflow_id IS DISTINCT FROM NEW.workflow_id
		OR OLD.execution_id IS DISTINCT FROM NEW.execution_id
		OR OLD.node_id IS DISTINCT FROM NEW.node_id
		OR OLD.audience IS DISTINCT FROM NEW.audience
		OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id
		OR (OLD.conversation_id IS DISTINCT FROM NEW.conversation_id AND NEW.conversation_id IS NOT NULL)
		OR (
			OLD.approver_emails IS DISTINCT FROM NEW.approver_emails
			AND (NEW.approver_emails IS NOT NULL OR NEW.status = 'pending')
		)
		OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
		OR OLD.timeout_action IS DISTINCT FROM NEW.timeout_action
		OR OLD.action_intent_digest IS DISTINCT FROM NEW.action_intent_digest
		OR OLD.requested_at IS DISTINCT FROM NEW.requested_at
		OR (
			OLD.display IS DISTINCT FROM NEW.display
			AND NEW.display IS DISTINCT FROM '{"title":"Content expired"}'::jsonb
		) THEN
		RAISE EXCEPTION 'Approval Request snapshots are immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_approval_decision_mutation() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM approval_requests WHERE id = OLD.approval_request_id) THEN
		RETURN OLD;
	END IF;
	-- End-user comments follow content retention and erasure; the rest of the Decision stays immutable evidence.
	IF TG_OP = 'UPDATE' AND NEW.comment IS NULL AND (to_jsonb(OLD) - 'comment') = (to_jsonb(NEW) - 'comment') THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'Approval Decisions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- Backfill: purge content left behind by External Subjects erased before erasure covered conversations and executions.
CREATE TEMP TABLE "erased_subject_conversations" AS
  SELECT c."id" FROM "conversations" c
  JOIN "external_subjects" s ON s."id" = c."external_subject_id"
  WHERE s."status" = 'erased';--> statement-breakpoint
CREATE TEMP TABLE "erased_subject_executions" AS
  SELECT e."id" FROM "executions" e
  WHERE e."external_subject_record_id" IN (SELECT "id" FROM "external_subjects" WHERE "status" = 'erased')
     OR e."conversation_id" IN (SELECT "id" FROM "erased_subject_conversations");--> statement-breakpoint
INSERT INTO "erased_subject_executions"
  SELECT "id" FROM "executions"
  WHERE "parent_execution_id" IN (SELECT "id" FROM "erased_subject_executions")
    AND "id" NOT IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
UPDATE "executions" SET "status" = 'cancelled', "completed_at" = now(), "leased_by" = NULL, "lease_expires_at" = NULL
  WHERE "id" IN (SELECT "id" FROM "erased_subject_executions") AND "status" IN ('queued', 'running', 'paused');--> statement-breakpoint
UPDATE "approval_requests" SET "status" = 'cancelled', "cancelled_at" = now(), "version" = "version" + 1
  WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions") AND "status" = 'pending';--> statement-breakpoint
DELETE FROM "outbox_messages"
  WHERE "event_type" = 'approval_request.created'
    AND ("external_subject_id" IN (SELECT "id" FROM "external_subjects" WHERE "status" = 'erased')
      OR "payload"->>'executionId' IN (SELECT "id"::text FROM "erased_subject_executions"));--> statement-breakpoint
DELETE FROM "regression_cases"
  WHERE "source_step_id" IN (SELECT "id" FROM "execution_steps" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions"));--> statement-breakpoint
UPDATE "execution_steps" SET "replayed_from_step_id" = NULL
  WHERE "replayed_from_step_id" IN (SELECT "id" FROM "execution_steps" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions"));--> statement-breakpoint
DELETE FROM "checkpoints" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "ai_node_progress" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "evaluator_node_progress" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "tool_call_records" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "wait_timers" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "execution_steps" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "flags" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
UPDATE "executions" SET
    "trigger_payload" = NULL,
    "output" = NULL,
    "error" = CASE WHEN "error" IS NULL THEN NULL ELSE '{"message":"Content erased"}'::jsonb END,
    "external_subject_id" = NULL,
    "content_erased_at" = now()
  WHERE "id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
UPDATE "approval_decisions" SET "comment" = NULL
  WHERE "approval_request_id" IN (SELECT "id" FROM "approval_requests" WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions"));--> statement-breakpoint
UPDATE "approval_requests" SET "display" = '{"title":"Content expired"}'::jsonb, "approver_emails" = NULL, "content_erased_at" = now()
  WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions") AND "status" <> 'pending';--> statement-breakpoint
UPDATE "action_intents" SET
    "target" = '{"redacted":true}'::jsonb,
    "normalized_parameters" = '{"redacted":true}'::jsonb,
    "provider_preconditions" = '{"redacted":true}'::jsonb,
    "safe_display" = '{"title":"Content expired"}'::jsonb,
    "canonical_envelope" = jsonb_build_object('version', 1, 'operationRevision', "operation_revision", 'connectionId', "connection_id"::text, 'connector', "connector", 'operation', "operation_id", 'target', jsonb_build_object('redacted', true), 'parameters', jsonb_build_object('redacted', true), 'providerPreconditions', jsonb_build_object('redacted', true)),
    "normalized_result" = NULL,
    "normalized_error" = NULL,
    "content_erased_at" = now()
  WHERE "execution_id" IN (SELECT "id" FROM "erased_subject_executions")
    AND "content_erased_at" IS NULL
    AND "status" IN ('succeeded', 'failed', 'stale', 'rejected', 'cancelled', 'outcome_unknown');--> statement-breakpoint
DELETE FROM "public_idempotency_records" WHERE "resource_id" IN (SELECT "id" FROM "erased_subject_executions");--> statement-breakpoint
DELETE FROM "flags"
  WHERE "conversation_finding_id" IN (
    SELECT f."id" FROM "conversation_findings" f
    JOIN "conversation_analyses" a ON a."id" = f."analysis_id"
    WHERE a."conversation_id" IN (SELECT "id" FROM "erased_subject_conversations"));--> statement-breakpoint
DELETE FROM "regression_cases"
  WHERE "source_finding_id" IN (
    SELECT f."id" FROM "conversation_findings" f
    JOIN "conversation_analyses" a ON a."id" = f."analysis_id"
    WHERE a."conversation_id" IN (SELECT "id" FROM "erased_subject_conversations"));--> statement-breakpoint
UPDATE "executions" SET "conversation_id" = NULL WHERE "conversation_id" IN (SELECT "id" FROM "erased_subject_conversations");--> statement-breakpoint
UPDATE "approval_requests" SET "conversation_id" = NULL WHERE "conversation_id" IN (SELECT "id" FROM "erased_subject_conversations");--> statement-breakpoint
DELETE FROM "public_idempotency_records"
  WHERE "resource_id" IN (SELECT "id" FROM "erased_subject_conversations")
     OR "resource_id" IN (SELECT "id" FROM "chat_messages" WHERE "conversation_id" IN (SELECT "id" FROM "erased_subject_conversations"));--> statement-breakpoint
DELETE FROM "conversations" WHERE "id" IN (SELECT "id" FROM "erased_subject_conversations");--> statement-breakpoint
DROP TABLE "erased_subject_executions";--> statement-breakpoint
DROP TABLE "erased_subject_conversations";
