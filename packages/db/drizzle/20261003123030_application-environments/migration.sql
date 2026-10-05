ALTER TABLE "workflow_versions" DROP CONSTRAINT "workflow_versions_contract_revision_fkey";--> statement-breakpoint
ALTER TABLE "end_user_event_streams" DROP CONSTRAINT "end_user_event_streams_session_fkey";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_execution_subject_fkey";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_conversation_owner_fkey";--> statement-breakpoint
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_endpoint_fkey";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_audience_check";--> statement-breakpoint
ALTER TABLE "outbox_messages" DROP CONSTRAINT "outbox_messages_kind_check";--> statement-breakpoint
DROP INDEX "workflows_workspace_slug_uidx";--> statement-breakpoint
DROP INDEX "end_user_sessions_application_subject_idx";--> statement-breakpoint
DROP INDEX "secrets_workspace_key_uidx";--> statement-breakpoint
DROP INDEX "conversations_id_application_subject_uidx";--> statement-breakpoint
DROP INDEX "conversations_application_thread_uidx";--> statement-breakpoint
DROP INDEX "connector_audit_facts_application_idx";--> statement-breakpoint
DROP INDEX "outbox_messages_application_subject_sequence_idx";--> statement-breakpoint
DROP INDEX "webhook_endpoints_id_application_uidx";--> statement-breakpoint
DROP INDEX "webhook_endpoints_application_idx";--> statement-breakpoint
DROP INDEX "webhook_deliveries_application_created_idx";--> statement-breakpoint
DROP INDEX "applications_internal_builder_workspace_uidx";--> statement-breakpoint
DROP INDEX "executions_approval_subject_scope_uidx";--> statement-breakpoint
DROP INDEX "end_user_sessions_audience_uidx";--> statement-breakpoint
DROP INDEX "end_user_event_streams_subject_lease_idx";--> statement-breakpoint
DROP INDEX "approval_requests_subject_status_idx";--> statement-breakpoint
DROP INDEX "action_intents_subject_status_idx";--> statement-breakpoint
DROP INDEX "conversations_subject_activity_idx";--> statement-breakpoint
DROP INDEX "connection_read_uses_owner_created_idx";--> statement-breakpoint
DROP INDEX "connections_active_ownership_uidx";--> statement-breakpoint
DROP INDEX "connections_subject_idx";--> statement-breakpoint
CREATE TYPE "environment_name" AS ENUM('dev', 'production');--> statement-breakpoint
CREATE TYPE "environment_key_scope" AS ENUM('subjects:provision', 'executions:read', 'executions:start', 'executions:cancel', 'conversations:read', 'conversations:write', 'events:read', 'audit:read', 'webhooks:read');--> statement-breakpoint
CREATE TABLE "external_subject_environments" (
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid,
	"external_subject_id" uuid,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_subject_environments_pkey" PRIMARY KEY("environment_id","external_subject_id")
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"environment" "environment_name" NOT NULL,
	"display_name" text NOT NULL,
	"logo_url" text,
	"allowed_browser_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_redirect_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_retention_days" integer DEFAULT 30 NOT NULL,
	"oidc_issuer" text,
	"oidc_client_id" text,
	"oidc_audience" text,
	"oidc_jwks_url" text,
	"oidc_subject_claim" text DEFAULT 'sub' NOT NULL,
	"connector_access_policy" jsonb DEFAULT '{"providers":[]}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environments_content_retention_days_check" CHECK ("content_retention_days" BETWEEN 1 AND 3650),
	CONSTRAINT "environments_identity_trust_check" CHECK (num_nonnulls("oidc_issuer", "oidc_client_id", "oidc_audience", "oidc_jwks_url") IN (0, 4)),
	CONSTRAINT "environments_browser_origins_check" CHECK ("oidc_issuer" IS NULL OR cardinality("allowed_browser_origins") > 0),
	CONSTRAINT "environments_redirect_origins_check" CHECK ("oidc_issuer" IS NULL OR cardinality("allowed_redirect_origins") > 0)
);
--> statement-breakpoint
CREATE TABLE "environment_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scopes" "environment_key_scope"[] NOT NULL,
	"hashed_key" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "environment_workflow_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_contract_revision_id" uuid NOT NULL,
	"allow_backend_start" boolean DEFAULT false NOT NULL,
	"allow_end_user_start" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_application_key_id_application_keys_id_fkey";--> statement-breakpoint
ALTER TABLE "executions" DROP CONSTRAINT "executions_application_fkey";--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" DROP CONSTRAINT "end_user_authorization_requests_application_fkey";--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" DROP CONSTRAINT "end_user_identity_exchanges_application_fkey";--> statement-breakpoint
ALTER TABLE "end_user_sessions" DROP CONSTRAINT "end_user_sessions_application_fkey";--> statement-breakpoint
ALTER TABLE "end_user_event_streams" DROP CONSTRAINT "end_user_event_streams_application_fkey";--> statement-breakpoint
ALTER TABLE "end_user_event_streams" DROP CONSTRAINT "end_user_event_streams_application_subject_fkey";--> statement-breakpoint
ALTER TABLE "secrets" DROP CONSTRAINT "secrets_workspace_id_organizations_id_fkey";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_application_fkey";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_subject_application_fkey";--> statement-breakpoint
ALTER TABLE "action_intents" DROP CONSTRAINT "action_intents_application_fkey";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_application_fkey";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_subject_application_fkey";--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" DROP CONSTRAINT "connection_authorization_requests_application_fkey";--> statement-breakpoint
ALTER TABLE "connection_read_uses" DROP CONSTRAINT "connection_read_uses_application_fkey";--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" DROP CONSTRAINT "connection_revocation_deliveries_application_fkey";--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT "connections_application_fkey";--> statement-breakpoint
ALTER TABLE "connector_audit_facts" DROP CONSTRAINT "connector_audit_facts_application_fkey";--> statement-breakpoint
ALTER TABLE "public_idempotency_records" DROP CONSTRAINT "public_idempotency_records_application_fkey";--> statement-breakpoint
ALTER TABLE "outbox_messages" DROP CONSTRAINT "outbox_messages_application_fkey";--> statement-breakpoint
ALTER TABLE "outbox_messages" DROP CONSTRAINT "outbox_messages_application_subject_fkey";--> statement-breakpoint
ALTER TABLE "webhook_endpoints" DROP CONSTRAINT "webhook_endpoints_application_fkey";--> statement-breakpoint
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_application_fkey";--> statement-breakpoint
DROP TABLE "external_subject_applications";--> statement-breakpoint
DROP TABLE "application_keys";--> statement-breakpoint
DROP TABLE "application_workflow_bindings";--> statement-breakpoint
ALTER TABLE "applications" DROP CONSTRAINT "applications_content_retention_days_check";--> statement-breakpoint
ALTER TABLE "applications" DROP CONSTRAINT "applications_browser_origins_check";--> statement-breakpoint
ALTER TABLE "applications" DROP CONSTRAINT "applications_redirect_origins_check";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_environment_key_id" uuid;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "application_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "end_user_sessions" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "action_intents" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "public_idempotency_records" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "action" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "audit_action";--> statement-breakpoint
CREATE TYPE "audit_action" AS ENUM('workspace.created', 'workspace.updated', 'workspace.deleted', 'workspace.transferred', 'environment.created', 'environment.updated', 'environment.trust_configuration_updated', 'environment.disabled', 'environment_key.created', 'environment_key.rotated', 'environment_key.revoked', 'environment_key.used', 'environment_key.scope_denied', 'environment_key.cross_environment_access_denied', 'external_subject.provisioned', 'external_subject.verified', 'external_subject.disabled', 'external_subject.erased', 'member.invited', 'member.invitation_revoked', 'member.invitation_accepted', 'member.joined', 'member.removed', 'member.role_changed', 'workflow.created', 'workflow.updated', 'workflow.published', 'workflow.archived', 'workflow.deleted', 'execution.created', 'execution.started', 'execution.completed', 'execution.failed', 'execution.cancelled', 'approval_request.decided', 'approval_request.timed_out', 'approval_request.cancelled', 'secret.created', 'secret.updated', 'secret.deleted', 'api_key.created', 'api_key.updated', 'api_key.deleted', 'variable.created', 'variable.updated', 'variable.deleted', 'webhook.created', 'webhook.updated', 'webhook.deleted', 'webhook.rotated', 'integration.connected', 'integration.disconnected', 'user.login', 'user.logout', 'system.maintenance_started', 'system.maintenance_completed');--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "action" SET DATA TYPE "audit_action" USING "action"::"audit_action";--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "resource" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "audit_resource";--> statement-breakpoint
CREATE TYPE "audit_resource" AS ENUM('workspace', 'environment', 'environment_key', 'external_subject', 'member', 'workflow', 'execution', 'approval_request', 'api_key', 'secret', 'webhook');--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "resource" SET DATA TYPE "audit_resource" USING "resource"::"audit_resource";--> statement-breakpoint
ALTER TABLE "public_idempotency_records" ALTER COLUMN "actor_kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public_idempotency_actor_kind";--> statement-breakpoint
CREATE TYPE "public_idempotency_actor_kind" AS ENUM('environment_key', 'end_user_session');--> statement-breakpoint
ALTER TABLE "public_idempotency_records" ALTER COLUMN "actor_kind" SET DATA TYPE "public_idempotency_actor_kind" USING "actor_kind"::"public_idempotency_actor_kind";--> statement-breakpoint
ALTER TABLE "audit_logs" DROP COLUMN "actor_application_key_id";--> statement-breakpoint
ALTER TABLE "executions" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "end_user_sessions" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "end_user_event_streams" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "secrets" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "action_intents" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "connection_read_uses" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "connections" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "connector_audit_facts" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "public_idempotency_records" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "outbox_messages" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "webhook_endpoints" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "webhook_deliveries" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "allowed_browser_origins";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "allowed_redirect_origins";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "content_retention_days";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "oidc_issuer";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "oidc_client_id";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "oidc_audience";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "oidc_jwks_url";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "oidc_subject_claim";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "connector_access_policy";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "executions_approval_subject_scope_uidx" ON "executions" ("id","workspace_id","workflow_id","environment_id","external_subject_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_audience_uidx" ON "end_user_sessions" ("id","workspace_id","environment_id","external_subject_id");--> statement-breakpoint
CREATE INDEX "end_user_event_streams_subject_lease_idx" ON "end_user_event_streams" ("environment_id","external_subject_id","lease_expires_at");--> statement-breakpoint
CREATE INDEX "approval_requests_subject_status_idx" ON "approval_requests" ("environment_id","external_subject_id","status");--> statement-breakpoint
CREATE INDEX "action_intents_subject_status_idx" ON "action_intents" ("environment_id","external_subject_id","status","created_at");--> statement-breakpoint
CREATE INDEX "conversations_subject_activity_idx" ON "conversations" ("environment_id","external_subject_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "connection_read_uses_owner_created_idx" ON "connection_read_uses" ("workspace_id","environment_id","external_subject_id","connection_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_active_ownership_uidx" ON "connections" ("workspace_id","environment_id","external_subject_id","provider","provider_account_id") WHERE "status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "connections_subject_idx" ON "connections" ("workspace_id","environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_deployment_scope_uidx" ON "workflow_versions" ("workflow_id","id","workflow_contract_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_application_slug_uidx" ON "workflows" ("application_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_id_application_workspace_uidx" ON "workflows" ("id","application_id","workspace_id");--> statement-breakpoint
CREATE INDEX "external_subject_environments_workspace_idx" ON "external_subject_environments" ("workspace_id");--> statement-breakpoint
CREATE INDEX "end_user_sessions_environment_subject_idx" ON "end_user_sessions" ("environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_environment_key_uidx" ON "secrets" ("environment_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_application_name_uidx" ON "environments" ("application_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_id_application_workspace_uidx" ON "environments" ("id","application_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_id_workspace_uidx" ON "environments" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "environments_workspace_idx" ON "environments" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_keys_hashed_key_uidx" ON "environment_keys" ("hashed_key");--> statement-breakpoint
CREATE INDEX "environment_keys_environment_created_idx" ON "environment_keys" ("environment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_workflow_bindings_environment_workflow_uidx" ON "environment_workflow_bindings" ("environment_id","workflow_id");--> statement-breakpoint
CREATE INDEX "environment_workflow_bindings_workspace_idx" ON "environment_workflow_bindings" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_environment_subject_uidx" ON "conversations" ("id","environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_environment_thread_uidx" ON "conversations" ("environment_id","external_thread_key") WHERE "external_thread_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "connector_audit_facts_environment_idx" ON "connector_audit_facts" ("environment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_environment_subject_sequence_idx" ON "outbox_messages" ("environment_id","external_subject_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_id_environment_uidx" ON "webhook_endpoints" ("id","environment_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_environment_idx" ON "webhook_endpoints" ("environment_id","disabled_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_environment_created_idx" ON "webhook_deliveries" ("environment_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_workspace_slug_uidx" ON "applications" ("workspace_id","slug");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_environment_key_id_environment_keys_id_fkey" FOREIGN KEY ("actor_environment_key_id") REFERENCES "environment_keys"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "external_subject_environments" ADD CONSTRAINT "external_subject_environments_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "external_subject_environments" ADD CONSTRAINT "external_subject_environments_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" ADD CONSTRAINT "end_user_authorization_requests_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD CONSTRAINT "end_user_identity_exchanges_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_sessions" ADD CONSTRAINT "end_user_sessions_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_environment_subject_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_environment_workspace_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_environment_id_environments_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_environment_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_keys" ADD CONSTRAINT "environment_keys_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_environment_fkey" FOREIGN KEY ("environment_id","application_id","workspace_id") REFERENCES "environments"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_workflow_fkey" FOREIGN KEY ("workflow_id","application_id","workspace_id") REFERENCES "workflows"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_version_fkey" FOREIGN KEY ("workflow_id","workflow_version_id","workflow_contract_revision_id") REFERENCES "workflow_versions"("workflow_id","id","workflow_contract_revision_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id","workspace_id") REFERENCES "workflow_contract_revisions"("workflow_id","id","workspace_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_subject_environment_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ADD CONSTRAINT "connector_audit_facts_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "public_idempotency_records" ADD CONSTRAINT "public_idempotency_records_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_environment_subject_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id") REFERENCES "workflow_contract_revisions"("workflow_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_session_fkey" FOREIGN KEY ("session_id","workspace_id","environment_id","external_subject_id") REFERENCES "end_user_sessions"("id","workspace_id","environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_subject_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id","environment_id","external_subject_id") REFERENCES "executions"("id","workspace_id","workflow_id","environment_id","external_subject_record_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_conversation_owner_fkey" FOREIGN KEY ("conversation_id","environment_id","external_subject_id") REFERENCES "conversations"("id","environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_fkey" FOREIGN KEY ("webhook_id","environment_id") REFERENCES "webhook_endpoints"("id","environment_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_audience_check" CHECK (("audience" = 'workspace' AND "external_subject_id" IS NULL) OR ("audience" = 'external_subject' AND "environment_id" IS NOT NULL AND "external_subject_id" IS NOT NULL AND "approver_emails" IS NULL));--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_kind_check" CHECK (("kind" = 'workflow_execution' AND "environment_id" IS NULL AND "external_subject_id" IS NULL AND "event_type" IS NULL) OR ("kind" = 'public_event' AND "environment_id" IS NOT NULL AND "event_type" IS NOT NULL));--> statement-breakpoint
DROP TYPE "application_environment";--> statement-breakpoint
DROP TYPE "application_kind";--> statement-breakpoint
DROP TYPE "application_key_scope";
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_approval_request_snapshot_mutation() RETURNS trigger AS $$
BEGIN
	IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
		OR OLD.environment_id IS DISTINCT FROM NEW.environment_id
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
