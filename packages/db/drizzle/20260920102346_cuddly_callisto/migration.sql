CREATE TYPE "connector_audit_fact_type" AS ENUM('connection.created', 'connection.refreshed', 'connection.credential_rotated', 'connection.reauthorization_required', 'connection.revoked', 'connection.revocation_payload_destroyed', 'action_intent.created', 'action_intent.consent_approved', 'action_intent.consent_rejected', 'action_intent.ready', 'action_intent.executing', 'action_intent.succeeded', 'action_intent.failed', 'action_intent.stale', 'action_intent.rejected', 'action_intent.cancelled', 'action_intent.outcome_unknown');--> statement-breakpoint
ALTER TYPE "application_key_scope" ADD VALUE 'audit:read' BEFORE 'webhooks:read';--> statement-breakpoint
CREATE TABLE "connector_audit_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid,
	"subject_reference" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"action_intent_id" uuid,
	"decision_id" uuid,
	"fact_type" "connector_audit_fact_type" NOT NULL,
	"provider" text NOT NULL,
	"operation_id" text,
	"digest" text,
	"outcome" text,
	"failure_class" text,
	"content" jsonb,
	"content_expires_at" timestamp with time zone NOT NULL,
	"content_erased_at" timestamp with time zone,
	"audit_expires_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_audit_facts_expiry_check" CHECK ("content_expires_at" <= "audit_expires_at"),
	CONSTRAINT "connector_audit_facts_content_state_check" CHECK (("content_erased_at" IS NULL) OR ("content" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "action_intents" ADD COLUMN "content_erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD COLUMN "last_failure_class" text;--> statement-breakpoint
CREATE INDEX "connector_audit_facts_workspace_idx" ON "connector_audit_facts" ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_application_idx" ON "connector_audit_facts" ("application_id","occurred_at");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_subject_idx" ON "connector_audit_facts" ("external_subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_retention_idx" ON "connector_audit_facts" ("content_expires_at","audit_expires_at");--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ADD CONSTRAINT "connector_audit_facts_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ADD CONSTRAINT "connector_audit_facts_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "action_intents" DROP CONSTRAINT "action_intents_outcome_check", ADD CONSTRAINT "action_intents_outcome_check" CHECK ("content_erased_at" IS NOT NULL OR (("status" = 'succeeded') = ("normalized_result" IS NOT NULL) AND ("status" IN ('failed', 'stale', 'outcome_unknown')) = ("normalized_error" IS NOT NULL)));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_action_intent_snapshot_mutation() RETURNS trigger AS $$
BEGIN
	IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
		OR OLD.application_id IS DISTINCT FROM NEW.application_id
		OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id
		OR OLD.connection_id IS DISTINCT FROM NEW.connection_id
		OR OLD.workflow_id IS DISTINCT FROM NEW.workflow_id
		OR OLD.execution_id IS DISTINCT FROM NEW.execution_id
		OR OLD.node_id IS DISTINCT FROM NEW.node_id
		OR OLD.approval_request_id IS DISTINCT FROM NEW.approval_request_id
		OR OLD.connector IS DISTINCT FROM NEW.connector
		OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
		OR OLD.operation_revision IS DISTINCT FROM NEW.operation_revision
		OR OLD.digest_version IS DISTINCT FROM NEW.digest_version
		OR OLD.canonical_digest IS DISTINCT FROM NEW.canonical_digest
		OR OLD.invocation_idempotency_key IS DISTINCT FROM NEW.invocation_idempotency_key
		OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
		RAISE EXCEPTION 'Action Intent snapshots are immutable' USING ERRCODE = '55000';
	END IF;
	IF OLD.content_erased_at IS NULL AND NEW.content_erased_at IS NOT NULL THEN
		IF NEW.status NOT IN ('succeeded', 'failed', 'stale', 'rejected', 'cancelled', 'outcome_unknown')
			OR NEW.target IS DISTINCT FROM '{"redacted":true}'::jsonb
			OR NEW.normalized_parameters IS DISTINCT FROM '{"redacted":true}'::jsonb
			OR NEW.provider_preconditions IS DISTINCT FROM '{"redacted":true}'::jsonb
			OR NEW.safe_display IS DISTINCT FROM '{"title":"Content expired"}'::jsonb
			OR NEW.canonical_envelope IS DISTINCT FROM jsonb_build_object(
				'version', 1,
				'operationRevision', NEW.operation_revision,
				'connectionId', NEW.connection_id::text,
				'connector', NEW.connector,
				'operation', NEW.operation_id,
				'target', jsonb_build_object('redacted', true),
				'parameters', jsonb_build_object('redacted', true),
				'providerPreconditions', jsonb_build_object('redacted', true)
			)
			OR NEW.normalized_result IS NOT NULL
			OR NEW.normalized_error IS NOT NULL THEN
			RAISE EXCEPTION 'Action Intent retention redaction is invalid' USING ERRCODE = '55000';
		END IF;
	ELSIF OLD.content_erased_at IS DISTINCT FROM NEW.content_erased_at
		OR OLD.target IS DISTINCT FROM NEW.target
		OR OLD.normalized_parameters IS DISTINCT FROM NEW.normalized_parameters
		OR OLD.provider_preconditions IS DISTINCT FROM NEW.provider_preconditions
		OR OLD.safe_display IS DISTINCT FROM NEW.safe_display
		OR OLD.canonical_envelope IS DISTINCT FROM NEW.canonical_envelope
		OR (
			OLD.content_erased_at IS NOT NULL
			AND (
				OLD.normalized_result IS DISTINCT FROM NEW.normalized_result
				OR OLD.normalized_error IS DISTINCT FROM NEW.normalized_error
			)
		) THEN
		RAISE EXCEPTION 'Action Intent snapshots are immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_approval_request_snapshot_mutation() RETURNS trigger AS $$
BEGIN
	IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
		OR OLD.application_id IS DISTINCT FROM NEW.application_id
		OR OLD.workflow_id IS DISTINCT FROM NEW.workflow_id
		OR OLD.execution_id IS DISTINCT FROM NEW.execution_id
		OR OLD.node_id IS DISTINCT FROM NEW.node_id
		OR OLD.audience IS DISTINCT FROM NEW.audience
		OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id
		OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
		OR OLD.approver_emails IS DISTINCT FROM NEW.approver_emails
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
$$ LANGUAGE plpgsql;
