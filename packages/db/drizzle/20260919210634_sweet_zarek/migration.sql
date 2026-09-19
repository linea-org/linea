CREATE TYPE "action_intent_status" AS ENUM('awaiting_consent', 'ready', 'executing', 'succeeded', 'failed', 'stale', 'rejected', 'cancelled', 'outcome_unknown');--> statement-breakpoint
CREATE TABLE "action_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"connector" text NOT NULL,
	"operation_id" text NOT NULL,
	"operation_revision" text NOT NULL,
	"target" jsonb NOT NULL,
	"normalized_parameters" jsonb NOT NULL,
	"provider_preconditions" jsonb NOT NULL,
	"safe_display" jsonb NOT NULL,
	"digest_version" text NOT NULL,
	"canonical_digest" text NOT NULL,
	"canonical_envelope" jsonb NOT NULL,
	"invocation_idempotency_key" text NOT NULL,
	"status" "action_intent_status" DEFAULT 'awaiting_consent'::"action_intent_status" NOT NULL,
	"normalized_result" jsonb,
	"normalized_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_intents_digest_check" CHECK ("digest_version" = 'jcs-sha256-v1' AND "canonical_digest" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "action_intents_identity_check" CHECK (char_length("invocation_idempotency_key") BETWEEN 1 AND 256),
	CONSTRAINT "action_intents_envelope_check" CHECK (jsonb_typeof("canonical_envelope") = 'object' AND "canonical_envelope"->>'connectionId' = "connection_id"::text AND "canonical_envelope"->>'connector' = "connector" AND "canonical_envelope"->>'operation' = "operation_id" AND "canonical_envelope"->>'operationRevision' = "operation_revision" AND "canonical_envelope"->'target' = "target" AND "canonical_envelope"->'parameters' = "normalized_parameters" AND "canonical_envelope"->'providerPreconditions' = "provider_preconditions"),
	CONSTRAINT "action_intents_display_check" CHECK (jsonb_typeof("safe_display") = 'object' AND jsonb_typeof("safe_display"->'title') = 'string' AND char_length("safe_display"->>'title') BETWEEN 1 AND 200 AND octet_length("safe_display"::text) <= 8192),
	CONSTRAINT "action_intents_outcome_check" CHECK (("status" = 'succeeded') = ("normalized_result" IS NOT NULL) AND ("status" IN ('failed', 'stale', 'outcome_unknown')) = ("normalized_error" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "action_intents_invocation_uidx" ON "action_intents" ("execution_id","node_id","invocation_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "action_intents_approval_request_uidx" ON "action_intents" ("approval_request_id");--> statement-breakpoint
CREATE INDEX "action_intents_subject_status_idx" ON "action_intents" ("application_id","external_subject_id","status","created_at");--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_connection_fkey" FOREIGN KEY ("connection_id","workspace_id") REFERENCES "connections"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_execution_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id") REFERENCES "executions"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_approval_request_fkey" FOREIGN KEY ("approval_request_id","workspace_id") REFERENCES "approval_requests"("id","workspace_id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE FUNCTION prevent_action_intent_snapshot_mutation() RETURNS trigger AS $$
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
		OR OLD.target IS DISTINCT FROM NEW.target
		OR OLD.normalized_parameters IS DISTINCT FROM NEW.normalized_parameters
		OR OLD.provider_preconditions IS DISTINCT FROM NEW.provider_preconditions
		OR OLD.safe_display IS DISTINCT FROM NEW.safe_display
		OR OLD.digest_version IS DISTINCT FROM NEW.digest_version
		OR OLD.canonical_digest IS DISTINCT FROM NEW.canonical_digest
		OR OLD.canonical_envelope IS DISTINCT FROM NEW.canonical_envelope
		OR OLD.invocation_idempotency_key IS DISTINCT FROM NEW.invocation_idempotency_key
		OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
		RAISE EXCEPTION 'Action Intent snapshots are immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER action_intent_snapshots_immutable
	BEFORE UPDATE ON "action_intents"
	FOR EACH ROW EXECUTE FUNCTION prevent_action_intent_snapshot_mutation();
