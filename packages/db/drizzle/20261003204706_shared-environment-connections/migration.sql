ALTER TYPE "audit_action" ADD VALUE 'connection.shared_created' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'connection.shared_revoked' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'connection.requester_assigned' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'connection.requester_revoked' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'connection.reviewer_assigned' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'connection.reviewer_revoked' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_resource" ADD VALUE 'connection' BEFORE 'member';--> statement-breakpoint
CREATE TABLE "connection_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connection_reviewer_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD COLUMN "reviewer_assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "action_intents" ADD COLUMN "connection_access_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "ownership" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "authorization_kind" text DEFAULT 'delegated_user' NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "external_subject_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ALTER COLUMN "subject_reference" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_shared_ownership_uidx" ON "connections" ("workspace_id","environment_id","provider","provider_account_id") WHERE "ownership" = 'environment' AND "status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_id_environment_workspace_uidx" ON "connections" ("id","environment_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_access_grants_active_uidx" ON "connection_access_grants" ("connection_id","external_subject_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "connection_access_grants_subject_idx" ON "connection_access_grants" ("environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_reviewer_assignments_active_uidx" ON "connection_reviewer_assignments" ("connection_id","external_subject_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "connection_reviewer_assignments_subject_idx" ON "connection_reviewer_assignments" ("environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "connection_access_grants" ADD CONSTRAINT "connection_access_grants_connection_fkey" FOREIGN KEY ("connection_id","environment_id","workspace_id") REFERENCES "connections"("id","environment_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_access_grants" ADD CONSTRAINT "connection_access_grants_membership_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_reviewer_assignments" ADD CONSTRAINT "connection_reviewer_assignments_connection_fkey" FOREIGN KEY ("connection_id","environment_id","workspace_id") REFERENCES "connections"("id","environment_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_reviewer_assignments" ADD CONSTRAINT "connection_reviewer_assignments_membership_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_ownership_check" CHECK (("ownership" = 'personal' AND "external_subject_id" IS NOT NULL AND "authorization_kind" = 'delegated_user') OR ("ownership" = 'environment' AND "external_subject_id" IS NULL AND "authorization_kind" = 'github_app_installation' AND "provider" = 'github'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_action_intent_snapshot_mutation() RETURNS trigger AS $$
DECLARE
	immutable_error_code CONSTANT text := '55000';
	redacted_content CONSTANT jsonb := '{"redacted":true}'::jsonb;
	redacted_key CONSTANT text := 'redacted';
BEGIN
	IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
		OR OLD.environment_id IS DISTINCT FROM NEW.environment_id
		OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id
		OR OLD.connection_id IS DISTINCT FROM NEW.connection_id
		OR OLD.connection_access_grant_id IS DISTINCT FROM NEW.connection_access_grant_id
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
		RAISE EXCEPTION 'Action Intent snapshots are immutable' USING ERRCODE = immutable_error_code;
	END IF;
	IF OLD.content_erased_at IS NULL AND NEW.content_erased_at IS NOT NULL THEN
		IF NEW.status NOT IN ('succeeded', 'failed', 'stale', 'rejected', 'cancelled', 'outcome_unknown')
			OR NEW.target IS DISTINCT FROM redacted_content
			OR NEW.normalized_parameters IS DISTINCT FROM redacted_content
			OR NEW.provider_preconditions IS DISTINCT FROM redacted_content
			OR NEW.safe_display IS DISTINCT FROM '{"title":"Content expired"}'::jsonb
			OR NEW.canonical_envelope IS DISTINCT FROM jsonb_build_object(
				'version', 1,
				'operationRevision', NEW.operation_revision,
				'connectionId', NEW.connection_id::text,
				'connector', NEW.connector,
				'operation', NEW.operation_id,
				'target', jsonb_build_object(redacted_key, true),
				'parameters', jsonb_build_object(redacted_key, true),
				'providerPreconditions', jsonb_build_object(redacted_key, true)
			)
			OR NEW.normalized_result IS NOT NULL
			OR NEW.normalized_error IS NOT NULL THEN
			RAISE EXCEPTION 'Action Intent retention redaction is invalid' USING ERRCODE = immutable_error_code;
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
		RAISE EXCEPTION 'Action Intent snapshots are immutable' USING ERRCODE = immutable_error_code;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION prevent_connection_authority_mutation() RETURNS trigger AS $$
BEGIN
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id OR OLD.environment_id IS DISTINCT FROM NEW.environment_id OR OLD.connection_id IS DISTINCT FROM NEW.connection_id OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id OR OLD.created_at IS DISTINCT FROM NEW.created_at OR (OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) THEN
  RAISE EXCEPTION 'Connection authority identity and revocation are immutable' USING ERRCODE = '55000';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER connection_access_grants_immutable BEFORE UPDATE ON connection_access_grants FOR EACH ROW EXECUTE FUNCTION prevent_connection_authority_mutation();
--> statement-breakpoint
CREATE TRIGGER connection_reviewer_assignments_immutable BEFORE UPDATE ON connection_reviewer_assignments FOR EACH ROW EXECUTE FUNCTION prevent_connection_authority_mutation();
