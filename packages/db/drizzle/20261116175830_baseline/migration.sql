CREATE TYPE "theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "notification_severity" AS ENUM('info', 'success', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "notification_type" AS ENUM('account.login_detected', 'account.new_device', 'account.email_verified', 'account.password_changed', 'workspace.invitation', 'workspace.invitation_accepted', 'workspace.member_joined', 'workspace.member_removed', 'workspace.role_changed', 'workspace.transferred', 'workflow.published', 'workflow.archived', 'workflow.deleted', 'execution.started', 'execution.completed', 'execution.failed', 'execution.approval_requested', 'template.hidden', 'template.appeal_upheld', 'template.appeal_rejected', 'system.info', 'system.warning', 'system.maintenance');--> statement-breakpoint
CREATE TYPE "audit_action" AS ENUM('workspace.created', 'workspace.updated', 'workspace.deleted', 'workspace.transferred', 'environment.created', 'environment.updated', 'environment.trust_configuration_updated', 'environment.disabled', 'environment_key.created', 'environment_key.rotated', 'environment_key.revoked', 'environment_key.used', 'environment_key.scope_denied', 'environment_key.cross_environment_access_denied', 'external_subject.provisioned', 'external_subject.verified', 'external_subject.disabled', 'external_subject.erased', 'member.invited', 'member.invitation_revoked', 'member.invitation_accepted', 'member.joined', 'member.removed', 'member.role_changed', 'workflow.created', 'workflow.updated', 'workflow.published', 'workflow.archived', 'workflow.deleted', 'execution.created', 'execution.started', 'execution.completed', 'execution.failed', 'execution.cancelled', 'approval_request.decided', 'approval_request.timed_out', 'approval_request.cancelled', 'secret.created', 'secret.updated', 'secret.deleted', 'api_key.created', 'api_key.updated', 'api_key.deleted', 'variable.created', 'variable.updated', 'variable.deleted', 'webhook.created', 'webhook.updated', 'webhook.deleted', 'webhook.rotated', 'connection.shared_created', 'connection.shared_revoked', 'connection.requester_assigned', 'connection.requester_revoked', 'connection.reviewer_assigned', 'connection.reviewer_revoked', 'integration.connected', 'integration.disconnected', 'user.login', 'user.logout', 'system.maintenance_started', 'system.maintenance_completed');--> statement-breakpoint
CREATE TYPE "audit_resource" AS ENUM('workspace', 'environment', 'environment_key', 'external_subject', 'connection', 'member', 'workflow', 'execution', 'approval_request', 'api_key', 'secret', 'webhook');--> statement-breakpoint
CREATE TYPE "execution_origin" AS ENUM('native', 'ingested');--> statement-breakpoint
CREATE TYPE "execution_status" AS ENUM('queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "execution_trigger" AS ENUM('manual', 'schedule', 'webhook', 'api');--> statement-breakpoint
CREATE TYPE "execution_environment" AS ENUM('draft', 'dev', 'production');--> statement-breakpoint
CREATE TYPE "external_subject_status" AS ENUM('provisioned', 'verified', 'disabled', 'erased');--> statement-breakpoint
CREATE TYPE "step_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "workspace_key_scope" AS ENUM('workflows:read', 'workflows:write', 'workflows:publish', 'applications:read', 'executions:read', 'executions:start', 'signals:read', 'signals:write', 'regressions:read', 'regressions:write', 'audit:read');--> statement-breakpoint
CREATE TYPE "flag_type" AS ENUM('retry_storm', 'branch_never_taken', 'cost_jump', 'excess_resumes', 'tool_error', 'empty_response', 'refusal', 'repeated_replay', 'user_frustration', 'hallucination_suspected', 'repetition_loop', 'inappropriate_refusal');--> statement-breakpoint
CREATE TYPE "approval_audience" AS ENUM('workspace', 'external_subject');--> statement-breakpoint
CREATE TYPE "approval_request_status" AS ENUM('pending', 'decided', 'cancelled');--> statement-breakpoint
CREATE TYPE "approval_timeout_action" AS ENUM('auto_reject', 'auto_approve');--> statement-breakpoint
CREATE TYPE "approval_decision_actor_kind" AS ENUM('workspace_member', 'external_subject', 'system');--> statement-breakpoint
CREATE TYPE "approval_decision_outcome" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "approval_decision_reason" AS ENUM('human', 'timeout');--> statement-breakpoint
CREATE TYPE "action_intent_status" AS ENUM('awaiting_consent', 'ready', 'executing', 'succeeded', 'failed', 'stale', 'rejected', 'cancelled', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "environment_name" AS ENUM('dev', 'production');--> statement-breakpoint
CREATE TYPE "environment_key_scope" AS ENUM('subjects:provision', 'executions:read', 'executions:start', 'executions:cancel', 'conversations:read', 'conversations:write', 'events:read', 'audit:read', 'webhooks:read');--> statement-breakpoint
CREATE TYPE "conversation_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "connector_audit_fact_type" AS ENUM('connection.created', 'connection.refreshed', 'connection.credential_rotated', 'connection.reauthorization_required', 'connection.revoked', 'connection.revocation_payload_destroyed', 'action_intent.created', 'action_intent.consent_approved', 'action_intent.consent_rejected', 'action_intent.ready', 'action_intent.executing', 'action_intent.succeeded', 'action_intent.failed', 'action_intent.stale', 'action_intent.rejected', 'action_intent.cancelled', 'action_intent.outcome_unknown');--> statement-breakpoint
CREATE TYPE "public_idempotency_actor_kind" AS ENUM('environment_key', 'end_user_session');--> statement-breakpoint
CREATE TYPE "chat_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "regression_case_type" AS ENUM('node', 'conversation');--> statement-breakpoint
CREATE TYPE "regression_run_trigger" AS ENUM('publish', 'manual');--> statement-breakpoint
CREATE TYPE "regression_result_status" AS ENUM('passed', 'failed', 'errored');--> statement-breakpoint
CREATE TYPE "outbox_event_type" AS ENUM('execution.completed', 'execution.failed', 'approval_request.created', 'approval_request.decided', 'approval_request.cancelled', 'action_intent.executed', 'action_intent.failed', 'connection.revoked');--> statement-breakpoint
CREATE TYPE "outbox_message_kind" AS ENUM('workflow_execution', 'public_event');--> statement-breakpoint
CREATE TYPE "outbox_message_status" AS ENUM('pending', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "webhook_delivery_status" AS ENUM('pending', 'delivering', 'retrying', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "webhook_secret_version" AS ENUM('current', 'previous');--> statement-breakpoint
CREATE TYPE "push_delivery_status" AS ENUM('pending', 'sending', 'receipt_pending', 'receipt_checking', 'retry', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "push_platform" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TYPE "assistant_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "workflow_template_moderation_status" AS ENUM('active', 'hidden');--> statement-breakpoint
CREATE TYPE "workflow_template_visibility" AS ENUM('workspace', 'public');--> statement-breakpoint
CREATE TYPE "template_appeal_status" AS ENUM('open', 'upheld', 'rejected');--> statement-breakpoint
CREATE TYPE "template_appeal_type" AS ENUM('not_a_violation', 'credentials_rotated', 'reported_in_bad_faith', 'automatic_hide_review', 'other');--> statement-breakpoint
CREATE TYPE "template_moderation_action" AS ENUM('auto_hide', 'hide', 'unhide', 'remove', 'dismiss_report', 'appeal', 'appeal_upheld', 'appeal_rejected');--> statement-breakpoint
CREATE TYPE "template_report_reason" AS ENUM('credentials', 'malicious', 'spam', 'inappropriate', 'other');--> statement-breakpoint
CREATE TYPE "template_report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY,
	"theme" "theme" DEFAULT 'system'::"theme" NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"marketing_emails" boolean DEFAULT false NOT NULL,
	"preferences" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"active_organization_id" uuid,
	"step_up_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"workspace_id" uuid,
	"type" "notification_type" NOT NULL,
	"severity" "notification_severity" DEFAULT 'info'::"notification_severity" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"metadata" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_environment_key_id" uuid,
	"actor_external_subject_id" uuid,
	"actor_end_user_session_id" uuid,
	"target_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"resource" "audit_resource" NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_contract_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"workflow_contract_revision_id" uuid,
	"message" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"published_version_id" uuid,
	"draft_graph" jsonb,
	"draft_updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"scratch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid,
	"workflow_version_id" uuid,
	"agent_id" uuid,
	"agent_version_id" uuid,
	"agent_contract_revision_id" uuid,
	"output" jsonb,
	"next_step_sequence" integer DEFAULT 0 NOT NULL,
	"environment_id" uuid,
	"workflow_contract_revision_id" uuid,
	"external_subject_record_id" uuid,
	"conversation_id" uuid,
	"parent_execution_id" uuid,
	"parent_node_id" text,
	"status" "execution_status" DEFAULT 'queued'::"execution_status" NOT NULL,
	"origin" "execution_origin" DEFAULT 'native'::"execution_origin" NOT NULL,
	"trigger" "execution_trigger" NOT NULL,
	"trigger_payload" jsonb,
	"environment" "execution_environment" DEFAULT 'dev'::"execution_environment" NOT NULL,
	"triggered_by_user_id" uuid,
	"external_subject_id" text,
	"leased_by" text,
	"lease_expires_at" timestamp with time zone,
	"enqueue_attempts" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"cost_unpriced" boolean,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"content_erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executions_root_check" CHECK (("workflow_id" IS NOT NULL AND "workflow_version_id" IS NOT NULL AND "agent_id" IS NULL AND "agent_version_id" IS NULL AND "agent_contract_revision_id" IS NULL) OR ("workflow_id" IS NULL AND "workflow_version_id" IS NULL AND "workflow_contract_revision_id" IS NULL AND "conversation_id" IS NULL AND "agent_id" IS NOT NULL AND "agent_version_id" IS NOT NULL AND "agent_contract_revision_id" IS NOT NULL AND "environment_id" IS NOT NULL AND ("external_subject_record_id" IS NOT NULL OR "parent_execution_id" IS NOT NULL))),
	CONSTRAINT "executions_parent_check" CHECK (("parent_execution_id" IS NULL AND "parent_node_id" IS NULL) OR ("parent_execution_id" IS NOT NULL AND "parent_node_id" IS NOT NULL AND "agent_id" IS NOT NULL))
);
--> statement-breakpoint
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
CREATE TABLE "external_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"issuer_subject" text,
	"status" "external_subject_status" DEFAULT 'provisioned'::"external_subject_status" NOT NULL,
	"audit_reference" uuid DEFAULT gen_random_uuid() NOT NULL,
	"verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_subjects_erasure_state_check" CHECK (("status" = 'erased' AND "issuer_subject" IS NULL AND "erased_at" IS NOT NULL) OR ("status" <> 'erased' AND "issuer_subject" IS NOT NULL AND "erased_at" IS NULL)),
	CONSTRAINT "external_subjects_disabled_state_check" CHECK (("status" IN ('disabled', 'erased') AND "disabled_at" IS NOT NULL) OR ("status" NOT IN ('disabled', 'erased') AND "disabled_at" IS NULL)),
	CONSTRAINT "external_subjects_verified_state_check" CHECK ("status" <> 'verified' OR "verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "end_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"label" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "end_user_authorization_rate_limits" (
	"key" text PRIMARY KEY,
	"request_count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "end_user_authorization_rate_limits_count_check" CHECK ("request_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "end_user_authorization_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"authorization_code_hash" text,
	"code_verifier_hash" text,
	"external_subject_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_user_authorization_requests_exchange_state_check" CHECK (("authorization_code_hash" IS NULL AND "code_verifier_hash" IS NULL) OR ("authorization_code_hash" IS NOT NULL AND "code_verifier_hash" IS NOT NULL)),
	CONSTRAINT "end_user_authorization_requests_completed_state_check" CHECK (("completed_at" IS NULL AND "external_subject_id" IS NULL) OR ("completed_at" IS NOT NULL AND "external_subject_id" IS NOT NULL AND "claimed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "end_user_identity_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"dpop_nonce_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "end_user_session_proofs" (
	"session_id" uuid,
	"jti_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_user_session_proofs_pkey" PRIMARY KEY("session_id","jti_hash")
);
--> statement-breakpoint
CREATE TABLE "end_user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"proof_jkt" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_user_sessions_last_used_check" CHECK ("last_used_at" IS NULL OR "last_used_at" >= "created_at")
);
--> statement-breakpoint
CREATE TABLE "end_user_event_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" "step_status" DEFAULT 'running'::"step_status" NOT NULL,
	"attributes" jsonb,
	"node_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"idempotency_key" text,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"model" text,
	"provider" text,
	"replayed_from_step_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_system_event" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"completed_step_ids" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"variables" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"cron_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"external_subject_id" text,
	"trigger_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"environment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scopes" "workspace_key_scope"[] NOT NULL,
	"hashed_key" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid,
	"execution_id" uuid,
	"node_id" text,
	"flag_type" "flag_type" NOT NULL,
	"detail" jsonb,
	"dedupe_key" text NOT NULL,
	"signal_id" uuid,
	"conversation_finding_id" uuid,
	"external_subject_id" text,
	"model" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid,
	"node_id" text,
	"flag_type" "flag_type" NOT NULL,
	"signal_key" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"regressed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid,
	"workflow_id" uuid,
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"audience" "approval_audience" NOT NULL,
	"external_subject_id" uuid,
	"conversation_id" uuid,
	"status" "approval_request_status" DEFAULT 'pending'::"approval_request_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"display" jsonb NOT NULL,
	"approver_emails" jsonb,
	"expires_at" timestamp with time zone,
	"timeout_action" "approval_timeout_action",
	"action_intent_digest" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"content_erased_at" timestamp with time zone,
	CONSTRAINT "approval_requests_audience_check" CHECK (("audience" = 'workspace' AND "external_subject_id" IS NULL) OR ("audience" = 'external_subject' AND "environment_id" IS NOT NULL AND "external_subject_id" IS NOT NULL AND "approver_emails" IS NULL)),
	CONSTRAINT "approval_requests_status_check" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)),
	CONSTRAINT "approval_requests_version_check" CHECK ("version" >= 1),
	CONSTRAINT "approval_requests_expiry_check" CHECK (("expires_at" IS NULL AND "timeout_action" IS NULL) OR ("expires_at" > "requested_at" AND "timeout_action" IS NOT NULL)),
	CONSTRAINT "approval_requests_display_check" CHECK (jsonb_typeof("display") = 'object' AND jsonb_typeof("display"->'title') = 'string' AND char_length("display"->>'title') BETWEEN 1 AND 200 AND ("display"->'description' IS NULL OR jsonb_typeof("display"->'description') = 'string') AND ("display"->'details' IS NULL OR jsonb_typeof("display"->'details') = 'object') AND octet_length("display"::text) <= 8192),
	CONSTRAINT "approval_requests_action_intent_digest_check" CHECK ("action_intent_digest" IS NULL OR (char_length("action_intent_digest") BETWEEN 1 AND 256 AND ("timeout_action" IS NULL OR "timeout_action" = 'auto_reject')))
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"outcome" "approval_decision_outcome" NOT NULL,
	"actor_kind" "approval_decision_actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"actor_external_subject_id" uuid,
	"end_user_session_id" uuid,
	"reviewer_assignment_id" uuid,
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
CREATE TABLE "action_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"connection_access_grant_id" uuid,
	"workflow_id" uuid,
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
	"execution_claim_id" text,
	"dispatch_started_at" timestamp with time zone,
	"provider_attempt_count" integer DEFAULT 0 NOT NULL,
	"normalized_result" jsonb,
	"normalized_error" jsonb,
	"content_erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_intents_digest_check" CHECK ("digest_version" = 'jcs-sha256-v1' AND "canonical_digest" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "action_intents_identity_check" CHECK (char_length("invocation_idempotency_key") BETWEEN 1 AND 256),
	CONSTRAINT "action_intents_envelope_check" CHECK (jsonb_typeof("canonical_envelope") = 'object' AND "canonical_envelope"->>'connectionId' = "connection_id"::text AND "canonical_envelope"->>'connector' = "connector" AND "canonical_envelope"->>'operation' = "operation_id" AND "canonical_envelope"->>'operationRevision' = "operation_revision" AND "canonical_envelope"->'target' = "target" AND "canonical_envelope"->'parameters' = "normalized_parameters" AND "canonical_envelope"->'providerPreconditions' = "provider_preconditions"),
	CONSTRAINT "action_intents_display_check" CHECK (jsonb_typeof("safe_display") = 'object' AND jsonb_typeof("safe_display"->'title') = 'string' AND char_length("safe_display"->>'title') BETWEEN 1 AND 200 AND octet_length("safe_display"::text) <= 8192),
	CONSTRAINT "action_intents_outcome_check" CHECK ("content_erased_at" IS NOT NULL OR (("status" = 'succeeded') = ("normalized_result" IS NOT NULL) AND ("status" IN ('failed', 'stale', 'outcome_unknown')) = ("normalized_error" IS NOT NULL))),
	CONSTRAINT "action_intents_execution_claim_check" CHECK (("status" IN ('executing', 'succeeded', 'failed', 'stale', 'outcome_unknown')) = ("execution_claim_id" IS NOT NULL)),
	CONSTRAINT "action_intents_dispatch_check" CHECK ("provider_attempt_count" >= 0 AND ("dispatch_started_at" IS NULL) = ("provider_attempt_count" = 0))
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
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"external_thread_key" text,
	"title" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"environment" "execution_environment" NOT NULL,
	"status" "conversation_status" DEFAULT 'active'::"conversation_status" NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_thread_key_length_check" CHECK ("external_thread_key" IS NULL OR char_length("external_thread_key") BETWEEN 1 AND 256),
	CONSTRAINT "conversations_title_length_check" CHECK ("title" IS NULL OR char_length("title") BETWEEN 1 AND 200),
	CONSTRAINT "conversations_metadata_size_check" CHECK (octet_length("metadata"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "connection_authorization_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"end_user_session_id" uuid,
	"provider" text NOT NULL,
	"scopes" text[] NOT NULL,
	"return_uri" text NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier_encrypted" text,
	"target_connection_id" uuid,
	"result_connection_id" uuid,
	"outcome" text,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_authorization_requests_scopes_check" CHECK (cardinality("scopes") > 0),
	CONSTRAINT "connection_authorization_requests_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('succeeded', 'failed')),
	CONSTRAINT "connection_authorization_requests_completion_check" CHECK (("completed_at" IS NULL AND "outcome" IS NULL AND "result_connection_id" IS NULL) OR ("completed_at" IS NOT NULL AND "outcome" = 'failed' AND "result_connection_id" IS NULL) OR ("completed_at" IS NOT NULL AND "outcome" = 'succeeded' AND "result_connection_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "connection_read_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_read_uses_outcome_check" CHECK ("outcome" IN ('succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "connection_revocation_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" text NOT NULL,
	"provider_account_id" text,
	"credential_encrypted" text,
	"expires_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_failure_class" text,
	"claimed_by" text,
	"claim_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_revocation_deliveries_payload_check" CHECK (("delivered_at" IS NULL AND "credential_encrypted" IS NOT NULL) OR ("delivered_at" IS NOT NULL AND "credential_encrypted" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid,
	"ownership" text DEFAULT 'personal' NOT NULL,
	"authorization_kind" text DEFAULT 'delegated_user' NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"account_label" text NOT NULL,
	"status" text NOT NULL,
	"scopes" text[] NOT NULL,
	"credential_encrypted" text,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "connections_ownership_check" CHECK (("ownership" = 'personal' AND "external_subject_id" IS NOT NULL AND "authorization_kind" = 'delegated_user') OR ("ownership" = 'environment' AND "external_subject_id" IS NULL AND "authorization_kind" = 'github_app_installation' AND "provider" = 'github')),
	CONSTRAINT "connections_status_check" CHECK ("status" IN ('active', 'reauthorization_required', 'revoked')),
	CONSTRAINT "connections_scopes_check" CHECK (cardinality("scopes") > 0),
	CONSTRAINT "connections_credential_state_check" CHECK (("status" = 'active' AND "credential_encrypted" IS NOT NULL AND "revoked_at" IS NULL) OR ("status" = 'reauthorization_required' AND "credential_encrypted" IS NULL AND "revoked_at" IS NULL) OR ("status" = 'revoked' AND "credential_encrypted" IS NULL AND "revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "connector_audit_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_id" uuid,
	"subject_reference" uuid,
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
CREATE TABLE "public_idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"actor_kind" "public_idempotency_actor_kind" NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_message_id" text,
	"execution_id" uuid,
	"responds_to_message_id" uuid,
	"sequence" bigserial,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_call_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"occurrence" integer NOT NULL,
	"status" integer NOT NULL,
	"body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_node_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"conversation" jsonb NOT NULL,
	"iteration" integer NOT NULL,
	"tokens_input" integer NOT NULL,
	"tokens_output" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluator_node_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"tokens_input" integer NOT NULL,
	"tokens_output" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluator_metric_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_version_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"metric_id" text NOT NULL,
	"metric_revision" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"external_subject_record_id" uuid,
	"external_subject_id" text NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memories_scope_key_uniq" UNIQUE NULLS NOT DISTINCT("workspace_id","environment_id","external_subject_record_id","external_subject_id","namespace","key")
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"workspace_id" uuid PRIMARY KEY,
	"behaviour_analysis_enabled" boolean DEFAULT false NOT NULL,
	"behaviour_sample_rate" real DEFAULT 1 NOT NULL,
	"behaviour_model" text,
	"default_model" text,
	"judge_model" text,
	"step_model" text,
	"platform_model_key_enabled" boolean DEFAULT false NOT NULL,
	"retention_days" integer,
	"redaction_rules" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_subject_id" text,
	"analyzed_through_sequence" bigint NOT NULL,
	"analyzer_version" text NOT NULL,
	"model" text,
	"provider" text,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_analysis_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"analysis_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"category" text NOT NULL,
	"confidence" real NOT NULL,
	"evidence_message_id" uuid,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regression_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"case_type" "regression_case_type" NOT NULL,
	"node_id" text,
	"input" jsonb NOT NULL,
	"assertions" jsonb DEFAULT '[]' NOT NULL,
	"source_step_id" uuid,
	"source_signal_id" uuid,
	"source_finding_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "regression_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"trigger" "regression_run_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regression_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"status" "regression_result_status" NOT NULL,
	"score" real,
	"output" jsonb,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wait_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"resume_at" timestamp with time zone NOT NULL,
	"fired" boolean DEFAULT false NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sequence" bigserial,
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid,
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
	CONSTRAINT "outbox_messages_kind_check" CHECK (("kind" = 'workflow_execution' AND "environment_id" IS NULL AND "external_subject_id" IS NULL AND "event_type" IS NULL) OR ("kind" = 'public_event' AND "environment_id" IS NOT NULL AND "event_type" IS NOT NULL)),
	CONSTRAINT "outbox_messages_claim_check" CHECK (("status" = 'publishing') = ("claimed_at" IS NOT NULL AND "claim_expires_at" IS NOT NULL AND "claimed_by" IS NOT NULL)),
	CONSTRAINT "outbox_messages_terminal_check" CHECK (("status" = 'published') = ("published_at" IS NOT NULL) AND ("status" = 'failed') = ("failed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"url" text NOT NULL,
	"current_secret_encrypted" text NOT NULL,
	"previous_secret_encrypted" text,
	"previous_secret_expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_previous_secret_check" CHECK (("previous_secret_encrypted" IS NULL) = ("previous_secret_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" "outbox_event_type" NOT NULL,
	"url" text NOT NULL,
	"body" text NOT NULL,
	"secret_version" "webhook_secret_version" DEFAULT 'current'::"webhook_secret_version" NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending'::"webhook_delivery_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "webhook_deliveries_body_check" CHECK (octet_length("body") <= 65536),
	CONSTRAINT "webhook_deliveries_terminal_check" CHECK (("status" = 'succeeded') = ("delivered_at" IS NOT NULL) AND ("status" = 'failed') = ("failed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"notification_id" uuid NOT NULL,
	"device_registration_id" uuid,
	"status" "push_delivery_status" DEFAULT 'pending'::"push_delivery_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"receipt_attempts" integer DEFAULT 0 NOT NULL,
	"ticket_id" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_device_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"token" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "agent_contract_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"agent_contract_revision_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workflow_id" uuid,
	"title" text NOT NULL,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"parent_id" uuid,
	"sequence" bigserial,
	"role" "assistant_message_role" NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]' NOT NULL,
	"proposal" jsonb,
	"actions" jsonb DEFAULT '[]' NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_agent_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_contract_revision_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_stars" (
	"template_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_template_stars_pkey" PRIMARY KEY("template_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"author_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"visibility" "workflow_template_visibility" DEFAULT 'workspace'::"workflow_template_visibility" NOT NULL,
	"moderation_status" "workflow_template_moderation_status" DEFAULT 'active'::"workflow_template_moderation_status" NOT NULL,
	"moderation_note" text,
	"moderated_at" timestamp with time zone,
	"moderated_by" uuid,
	"star_count" integer DEFAULT 0 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"appellant_id" uuid,
	"type" "template_appeal_type" NOT NULL,
	"message" text,
	"status" "template_appeal_status" DEFAULT 'open'::"template_appeal_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "workflow_template_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid,
	"template_name" text NOT NULL,
	"author_workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" "template_moderation_action" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reporter_workspace_id" uuid NOT NULL,
	"reason" "template_report_reason" NOT NULL,
	"details" text,
	"status" "template_report_status" DEFAULT 'open'::"template_report_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text
);
--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" ("secret");--> statement-breakpoint
CREATE INDEX "two_factors_userId_idx" ON "two_factors" ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_organizationId_idx" ON "invitations" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" ("email");--> statement-breakpoint
CREATE INDEX "members_organizationId_idx" ON "members" ("organization_id");--> statement-breakpoint
CREATE INDEX "members_userId_idx" ON "members" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "organizations" ("slug");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" ("type");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_idx" ON "audit_logs" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" ("resource","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_contract_revisions_workflow_revision_uidx" ON "workflow_contract_revisions" ("workflow_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_contract_revisions_workflow_id_uidx" ON "workflow_contract_revisions" ("workflow_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_contract_revisions_scope_uidx" ON "workflow_contract_revisions" ("workflow_id","id","workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_contract_revisions_workspace_idx" ON "workflow_contract_revisions" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_version_uidx" ON "workflow_versions" ("workflow_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_id_id_uidx" ON "workflow_versions" ("workflow_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_deployment_scope_uidx" ON "workflow_versions" ("workflow_id","id","workflow_contract_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_application_slug_uidx" ON "workflows" ("application_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_id_application_workspace_uidx" ON "workflows" ("id","application_id","workspace_id");--> statement-breakpoint
CREATE INDEX "workflows_workspace_idx" ON "workflows" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_id_workspace_uidx" ON "workflows" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_parent_node_uidx" ON "executions" ("parent_execution_id","parent_node_id") WHERE "parent_execution_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "executions_workflow_created_idx" ON "executions" ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "executions_workspace_created_idx" ON "executions" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "executions_workspace_subject_created_idx" ON "executions" ("workspace_id","external_subject_id","created_at");--> statement-breakpoint
CREATE INDEX "executions_lease_claim_idx" ON "executions" ("status","lease_expires_at") WHERE "status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "executions_id_workspace_uidx" ON "executions" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_id_workspace_workflow_uidx" ON "executions" ("id","workspace_id","workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_root_subject_scope_uidx" ON "executions" ("id","workspace_id","environment_id","external_subject_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_approval_subject_scope_uidx" ON "executions" ("id","workspace_id","workflow_id","environment_id","external_subject_record_id");--> statement-breakpoint
CREATE INDEX "external_subject_environments_workspace_idx" ON "external_subject_environments" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_subjects_identity_uidx" ON "external_subjects" ("workspace_id","issuer","issuer_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "external_subjects_id_workspace_uidx" ON "external_subjects" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_subjects_audit_reference_uidx" ON "external_subjects" ("audit_reference");--> statement-breakpoint
CREATE INDEX "external_subjects_workspace_status_idx" ON "external_subjects" ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "end_subjects_workspace_external_id_uidx" ON "end_subjects" ("workspace_id","external_id");--> statement-breakpoint
CREATE INDEX "end_user_authorization_rate_limits_expiry_idx" ON "end_user_authorization_rate_limits" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_authorization_requests_state_hash_uidx" ON "end_user_authorization_requests" ("state_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_authorization_requests_code_hash_uidx" ON "end_user_authorization_requests" ("authorization_code_hash") WHERE "authorization_code_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "end_user_authorization_requests_expiry_idx" ON "end_user_authorization_requests" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_identity_exchanges_token_hash_uidx" ON "end_user_identity_exchanges" ("token_hash");--> statement-breakpoint
CREATE INDEX "end_user_identity_exchanges_expiry_idx" ON "end_user_identity_exchanges" ("expires_at");--> statement-breakpoint
CREATE INDEX "end_user_session_proofs_expiry_idx" ON "end_user_session_proofs" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_token_hash_uidx" ON "end_user_sessions" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_id_workspace_uidx" ON "end_user_sessions" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_audience_uidx" ON "end_user_sessions" ("id","workspace_id","environment_id","external_subject_id");--> statement-breakpoint
CREATE INDEX "end_user_sessions_environment_subject_idx" ON "end_user_sessions" ("environment_id","external_subject_id");--> statement-breakpoint
CREATE INDEX "end_user_sessions_expiry_idx" ON "end_user_sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX "end_user_event_streams_subject_lease_idx" ON "end_user_event_streams" ("environment_id","external_subject_id","lease_expires_at");--> statement-breakpoint
CREATE INDEX "execution_steps_execution_seq_idx" ON "execution_steps" ("execution_id","sequence");--> statement-breakpoint
CREATE INDEX "execution_steps_trace_idx" ON "execution_steps" ("trace_id");--> statement-breakpoint
CREATE INDEX "execution_steps_node_name_status_ended_idx" ON "execution_steps" ("node_id","name","status","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_steps_idempotency_uidx" ON "execution_steps" ("execution_id","idempotency_key") WHERE "idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_execution_sequence_uidx" ON "checkpoints" ("execution_id","sequence");--> statement-breakpoint
CREATE INDEX "schedules_next_run_idx" ON "schedules" ("next_run_at") WHERE "enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_environment_key_uidx" ON "secrets" ("environment_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hashed_key_uidx" ON "api_keys" ("hashed_key");--> statement-breakpoint
CREATE INDEX "api_keys_creator_idx" ON "api_keys" ("workspace_id","created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_dedupe_key_uidx" ON "flags" ("dedupe_key");--> statement-breakpoint
CREATE INDEX "flags_workspace_subject_created_idx" ON "flags" ("workspace_id","external_subject_id","created_at");--> statement-breakpoint
CREATE INDEX "flags_signal_id_idx" ON "flags" ("signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_signal_key_uidx" ON "signals" ("signal_key");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_execution_node_uidx" ON "approval_requests" ("execution_id","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_id_workspace_uidx" ON "approval_requests" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "approval_requests_workspace_status_idx" ON "approval_requests" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "approval_requests_subject_status_idx" ON "approval_requests" ("environment_id","external_subject_id","status");--> statement-breakpoint
CREATE INDEX "approval_requests_expiry_idx" ON "approval_requests" ("expires_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decisions_request_uidx" ON "approval_decisions" ("approval_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "action_intents_invocation_uidx" ON "action_intents" ("execution_id","node_id","invocation_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "action_intents_approval_request_uidx" ON "action_intents" ("approval_request_id");--> statement-breakpoint
CREATE INDEX "action_intents_subject_status_idx" ON "action_intents" ("environment_id","external_subject_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_application_name_uidx" ON "environments" ("application_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_id_application_workspace_uidx" ON "environments" ("id","application_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_id_workspace_uidx" ON "environments" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "environments_workspace_idx" ON "environments" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_keys_hashed_key_uidx" ON "environment_keys" ("hashed_key");--> statement-breakpoint
CREATE INDEX "environment_keys_environment_created_idx" ON "environment_keys" ("environment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_workflow_bindings_environment_workflow_uidx" ON "environment_workflow_bindings" ("environment_id","workflow_id");--> statement-breakpoint
CREATE INDEX "environment_workflow_bindings_workspace_idx" ON "environment_workflow_bindings" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_workspace_uidx" ON "conversations" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_workspace_workflow_uidx" ON "conversations" ("id","workspace_id","workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_environment_subject_uidx" ON "conversations" ("id","environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_environment_thread_uidx" ON "conversations" ("environment_id","external_thread_key") WHERE "external_thread_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_subject_activity_idx" ON "conversations" ("environment_id","external_subject_id","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_authorization_requests_state_hash_uidx" ON "connection_authorization_requests" ("state_hash");--> statement-breakpoint
CREATE INDEX "connection_authorization_requests_expiry_idx" ON "connection_authorization_requests" ("expires_at");--> statement-breakpoint
CREATE INDEX "connection_read_uses_owner_created_idx" ON "connection_read_uses" ("workspace_id","environment_id","external_subject_id","connection_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "connection_revocation_deliveries_pending_idx" ON "connection_revocation_deliveries" ("delivered_at","available_at","expires_at");--> statement-breakpoint
CREATE INDEX "connection_revocation_deliveries_account_idx" ON "connection_revocation_deliveries" ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_active_ownership_uidx" ON "connections" ("workspace_id","environment_id","external_subject_id","provider","provider_account_id") WHERE "status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_shared_ownership_uidx" ON "connections" ("workspace_id","environment_id","provider","provider_account_id") WHERE "ownership" = 'environment' AND "status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_id_environment_workspace_uidx" ON "connections" ("id","environment_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_id_workspace_uidx" ON "connections" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "connections_subject_idx" ON "connections" ("workspace_id","environment_id","external_subject_id");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_workspace_idx" ON "connector_audit_facts" ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_environment_idx" ON "connector_audit_facts" ("environment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_subject_idx" ON "connector_audit_facts" ("external_subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "connector_audit_facts_retention_idx" ON "connector_audit_facts" ("content_expires_at","audit_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_idempotency_actor_operation_key_uidx" ON "public_idempotency_records" ("actor_kind","actor_id","operation","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_conversation_client_message_uidx" ON "chat_messages" ("conversation_id","client_message_id") WHERE "client_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_sequence_idx" ON "chat_messages" ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_call_records_execution_node_hash_occurrence_uidx" ON "tool_call_records" ("execution_id","node_id","content_hash","occurrence");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_node_progress_execution_node_uidx" ON "ai_node_progress" ("execution_id","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluator_node_progress_execution_node_uidx" ON "evaluator_node_progress" ("execution_id","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluator_metric_steps_version_node_metric_revision_uidx" ON "evaluator_metric_steps" ("workflow_version_id","node_id","metric_id","metric_revision");--> statement-breakpoint
CREATE INDEX "conversation_analyses_conversation_created_idx" ON "conversation_analyses" ("workspace_id","workflow_id","conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_analyses_id_workspace_uidx" ON "conversation_analyses" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_analysis_claims_conversation_uidx" ON "conversation_analysis_claims" ("workspace_id","workflow_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_findings_analysis_idx" ON "conversation_findings" ("analysis_id");--> statement-breakpoint
CREATE INDEX "conversation_findings_workspace_category_idx" ON "conversation_findings" ("workspace_id","category","created_at");--> statement-breakpoint
CREATE INDEX "regression_cases_workflow_idx" ON "regression_cases" ("workspace_id","workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "regression_runs_workflow_started_idx" ON "regression_runs" ("workspace_id","workflow_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "regression_runs_id_workspace_uidx" ON "regression_runs" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "regression_results_run_idx" ON "regression_results" ("run_id");--> statement-breakpoint
CREATE INDEX "regression_results_case_idx" ON "regression_results" ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wait_timers_execution_node_uidx" ON "wait_timers" ("execution_id","node_id");--> statement-breakpoint
CREATE INDEX "wait_timers_workspace_fired_idx" ON "wait_timers" ("workspace_id","fired");--> statement-breakpoint
CREATE INDEX "wait_timers_resume_at_idx" ON "wait_timers" ("resume_at") WHERE "fired" = false;--> statement-breakpoint
CREATE INDEX "outbox_messages_dispatch_idx" ON "outbox_messages" ("kind","status","available_at","claim_expires_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_environment_subject_sequence_idx" ON "outbox_messages" ("environment_id","external_subject_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_id_environment_uidx" ON "webhook_endpoints" ("id","environment_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_environment_idx" ON "webhook_endpoints" ("environment_id","disabled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_webhook_event_uidx" ON "webhook_deliveries" ("webhook_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_environment_created_idx" ON "webhook_deliveries" ("environment_id","created_at","id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_retention_idx" ON "webhook_deliveries" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_deliveries_notification_device_idx" ON "push_deliveries" ("notification_id","device_registration_id");--> statement-breakpoint
CREATE INDEX "push_deliveries_dispatch_idx" ON "push_deliveries" ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_device_registrations_token_idx" ON "push_device_registrations" ("token");--> statement-breakpoint
CREATE INDEX "push_device_registrations_user_idx" ON "push_device_registrations" ("user_id");--> statement-breakpoint
CREATE INDEX "push_device_registrations_session_idx" ON "push_device_registrations" ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_workspace_slug_uidx" ON "applications" ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_id_workspace_uidx" ON "applications" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "applications_workspace_idx" ON "applications" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_access_grants_active_uidx" ON "connection_access_grants" ("connection_id","external_subject_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "connection_access_grants_subject_idx" ON "connection_access_grants" ("environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_reviewer_assignments_active_uidx" ON "connection_reviewer_assignments" ("connection_id","external_subject_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "connection_reviewer_assignments_subject_idx" ON "connection_reviewer_assignments" ("environment_id","external_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_contract_revisions_agent_revision_uidx" ON "agent_contract_revisions" ("agent_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_contract_revisions_agent_id_uidx" ON "agent_contract_revisions" ("agent_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_contract_revisions_scope_uidx" ON "agent_contract_revisions" ("agent_id","id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_uidx" ON "agent_versions" ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_deployment_scope_uidx" ON "agent_versions" ("agent_id","id","agent_contract_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_application_slug_uidx" ON "agents" ("application_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_id_workspace_uidx" ON "agents" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_id_application_workspace_uidx" ON "agents" ("id","application_id","workspace_id");--> statement-breakpoint
CREATE INDEX "agents_workspace_idx" ON "agents" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_conversations_id_workspace_uidx" ON "assistant_conversations" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "assistant_conversations_owner_updated_idx" ON "assistant_conversations" ("workspace_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_sequence_idx" ON "assistant_messages" ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_agent_bindings_environment_agent_uidx" ON "environment_agent_bindings" ("environment_id","agent_id");--> statement-breakpoint
CREATE INDEX "environment_agent_bindings_workspace_idx" ON "environment_agent_bindings" ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_templates_workspace_created_idx" ON "workflow_templates" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_templates_visibility_stars_idx" ON "workflow_templates" ("visibility","star_count");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_template_appeals_one_open_uidx" ON "workflow_template_appeals" ("template_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "workflow_template_appeals_status_created_idx" ON "workflow_template_appeals" ("status","created_at");--> statement-breakpoint
CREATE INDEX "workflow_template_moderation_events_template_idx" ON "workflow_template_moderation_events" ("template_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_template_reports_template_reporter_uidx" ON "workflow_template_reports" ("template_id","reporter_id");--> statement-breakpoint
CREATE INDEX "workflow_template_reports_status_created_idx" ON "workflow_template_reports" ("status","created_at");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_environment_key_id_environment_keys_id_fkey" FOREIGN KEY ("actor_environment_key_id") REFERENCES "environment_keys"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_external_subject_id_external_subjects_id_fkey" FOREIGN KEY ("actor_external_subject_id") REFERENCES "external_subjects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_contract_revisions" ADD CONSTRAINT "workflow_contract_revisions_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_contract_revisions" ADD CONSTRAINT "workflow_contract_revisions_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id") REFERENCES "workflow_contract_revisions"("workflow_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_published_version_fkey" FOREIGN KEY ("id","published_version_id") REFERENCES "workflow_versions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_parent_execution_id_executions_id_fkey" FOREIGN KEY ("parent_execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_triggered_by_user_id_users_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_workspace_fkey" FOREIGN KEY ("agent_id","workspace_id") REFERENCES "agents"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_version_fkey" FOREIGN KEY ("agent_id","agent_version_id","agent_contract_revision_id") REFERENCES "agent_versions"("agent_id","id","agent_contract_revision_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_contract_fkey" FOREIGN KEY ("agent_id","agent_contract_revision_id","workspace_id") REFERENCES "agent_contract_revisions"("agent_id","id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_version_fkey" FOREIGN KEY ("workflow_id","workflow_version_id") REFERENCES "workflow_versions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id","workspace_id") REFERENCES "workflow_contract_revisions"("workflow_id","id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_external_subject_fkey" FOREIGN KEY ("external_subject_record_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id");--> statement-breakpoint
ALTER TABLE "external_subject_environments" ADD CONSTRAINT "external_subject_environments_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "external_subject_environments" ADD CONSTRAINT "external_subject_environments_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "external_subjects" ADD CONSTRAINT "external_subjects_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_subjects" ADD CONSTRAINT "end_subjects_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" ADD CONSTRAINT "end_user_authorization_requests_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" ADD CONSTRAINT "end_user_authorization_requests_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD CONSTRAINT "end_user_identity_exchanges_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD CONSTRAINT "end_user_identity_exchanges_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_session_proofs" ADD CONSTRAINT "end_user_session_proofs_session_id_end_user_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "end_user_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_sessions" ADD CONSTRAINT "end_user_sessions_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_sessions" ADD CONSTRAINT "end_user_sessions_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_environment_subject_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_event_streams" ADD CONSTRAINT "end_user_event_streams_session_fkey" FOREIGN KEY ("session_id","workspace_id","environment_id","external_subject_id") REFERENCES "end_user_sessions"("id","workspace_id","environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_replayed_from_step_id_execution_steps_id_fkey" FOREIGN KEY ("replayed_from_step_id") REFERENCES "execution_steps"("id");--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_workspace_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_environment_workspace_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_environment_id_environments_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_root_subject_fkey" FOREIGN KEY ("execution_id","workspace_id","environment_id","external_subject_id") REFERENCES "executions"("id","workspace_id","environment_id","external_subject_record_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_root_execution_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id") REFERENCES "executions"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_subject_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id","environment_id","external_subject_id") REFERENCES "executions"("id","workspace_id","workflow_id","environment_id","external_subject_record_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_external_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_environment_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_conversation_owner_fkey" FOREIGN KEY ("conversation_id","environment_id","external_subject_id") REFERENCES "conversations"("id","environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_1cuDWARikKSZ_fkey" FOREIGN KEY ("reviewer_assignment_id") REFERENCES "connection_reviewer_assignments"("id");--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_fkey" FOREIGN KEY ("approval_request_id","workspace_id") REFERENCES "approval_requests"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_external_subject_fkey" FOREIGN KEY ("actor_external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_ZXQXKXPsZROJ_fkey" FOREIGN KEY ("connection_access_grant_id") REFERENCES "connection_access_grants"("id");--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_root_execution_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_connection_fkey" FOREIGN KEY ("connection_id","workspace_id") REFERENCES "connections"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_execution_fkey" FOREIGN KEY ("execution_id","workspace_id","workflow_id") REFERENCES "executions"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_approval_request_fkey" FOREIGN KEY ("approval_request_id","workspace_id") REFERENCES "approval_requests"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_keys" ADD CONSTRAINT "environment_keys_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_environment_fkey" FOREIGN KEY ("environment_id","application_id","workspace_id") REFERENCES "environments"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_workflow_fkey" FOREIGN KEY ("workflow_id","application_id","workspace_id") REFERENCES "workflows"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_version_fkey" FOREIGN KEY ("workflow_id","workflow_version_id","workflow_contract_revision_id") REFERENCES "workflow_versions"("workflow_id","id","workflow_contract_revision_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_workflow_bindings" ADD CONSTRAINT "environment_workflow_bindings_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id","workspace_id") REFERENCES "workflow_contract_revisions"("workflow_id","id","workspace_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_subject_environment_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_session_fkey" FOREIGN KEY ("end_user_session_id") REFERENCES "end_user_sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_connection_fkey" FOREIGN KEY ("connection_id","workspace_id") REFERENCES "connections"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_read_uses" ADD CONSTRAINT "connection_read_uses_execution_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_connection_fkey" FOREIGN KEY ("connection_id","workspace_id") REFERENCES "connections"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ADD CONSTRAINT "connector_audit_facts_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connector_audit_facts" ADD CONSTRAINT "connector_audit_facts_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "public_idempotency_records" ADD CONSTRAINT "public_idempotency_records_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_responds_to_message_id_chat_messages_id_fkey" FOREIGN KEY ("responds_to_message_id") REFERENCES "chat_messages"("id");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id") REFERENCES "conversations"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tool_call_records" ADD CONSTRAINT "tool_call_records_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_node_progress" ADD CONSTRAINT "ai_node_progress_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evaluator_node_progress" ADD CONSTRAINT "evaluator_node_progress_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evaluator_metric_steps" ADD CONSTRAINT "evaluator_metric_steps_EES7C90sSUr1_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_subject_fkey" FOREIGN KEY ("external_subject_record_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_analysis_claims" ADD CONSTRAINT "conversation_analysis_claims_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_findings" ADD CONSTRAINT "conversation_findings_analysis_workspace_fkey" FOREIGN KEY ("analysis_id","workspace_id") REFERENCES "conversation_analyses"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regression_cases" ADD CONSTRAINT "regression_cases_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regression_cases" ADD CONSTRAINT "regression_cases_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regression_runs" ADD CONSTRAINT "regression_runs_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regression_runs" ADD CONSTRAINT "regression_runs_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regression_runs" ADD CONSTRAINT "regression_runs_workflow_version_fkey" FOREIGN KEY ("workflow_id","workflow_version_id") REFERENCES "workflow_versions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "regression_results" ADD CONSTRAINT "regression_results_run_workspace_fkey" FOREIGN KEY ("run_id","workspace_id") REFERENCES "regression_runs"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_environment_subject_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_outbox_messages_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_environment_fkey" FOREIGN KEY ("environment_id","workspace_id") REFERENCES "environments"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_fkey" FOREIGN KEY ("webhook_id","environment_id") REFERENCES "webhook_endpoints"("id","environment_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_49TQlqMFpEFz_fkey" FOREIGN KEY ("device_registration_id") REFERENCES "push_device_registrations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "push_device_registrations" ADD CONSTRAINT "push_device_registrations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_device_registrations" ADD CONSTRAINT "push_device_registrations_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_access_grants" ADD CONSTRAINT "connection_access_grants_connection_fkey" FOREIGN KEY ("connection_id","environment_id","workspace_id") REFERENCES "connections"("id","environment_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_access_grants" ADD CONSTRAINT "connection_access_grants_membership_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "connection_reviewer_assignments" ADD CONSTRAINT "connection_reviewer_assignments_connection_fkey" FOREIGN KEY ("connection_id","environment_id","workspace_id") REFERENCES "connections"("id","environment_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_reviewer_assignments" ADD CONSTRAINT "connection_reviewer_assignments_membership_fkey" FOREIGN KEY ("environment_id","external_subject_id") REFERENCES "external_subject_environments"("environment_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "agent_contract_revisions" ADD CONSTRAINT "agent_contract_revisions_agent_fkey" FOREIGN KEY ("agent_id","workspace_id") REFERENCES "agents"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_contract_revision_fkey" FOREIGN KEY ("agent_id","agent_contract_revision_id") REFERENCES "agent_contract_revisions"("agent_id","id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_parent_id_assistant_messages_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "assistant_messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id") REFERENCES "assistant_conversations"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_environment_fkey" FOREIGN KEY ("environment_id","application_id","workspace_id") REFERENCES "environments"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_agent_fkey" FOREIGN KEY ("agent_id","application_id","workspace_id") REFERENCES "agents"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_version_fkey" FOREIGN KEY ("agent_id","agent_version_id","agent_contract_revision_id") REFERENCES "agent_versions"("agent_id","id","agent_contract_revision_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_contract_revision_fkey" FOREIGN KEY ("agent_id","agent_contract_revision_id","workspace_id") REFERENCES "agent_contract_revisions"("agent_id","id","workspace_id");--> statement-breakpoint
ALTER TABLE "workflow_template_stars" ADD CONSTRAINT "workflow_template_stars_template_id_workflow_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_stars" ADD CONSTRAINT "workflow_template_stars_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_moderated_by_users_id_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_j5LduEan5Smk_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_appellant_id_users_id_fkey" FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_appeals" ADD CONSTRAINT "workflow_template_appeals_decided_by_users_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_moderation_events" ADD CONSTRAINT "workflow_template_moderation_events_wdsnbd7Zu8AI_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_moderation_events" ADD CONSTRAINT "workflow_template_moderation_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_w3CcSk5WCowB_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_0fhwKp66LzLj_fkey" FOREIGN KEY ("reporter_workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_reports" ADD CONSTRAINT "workflow_template_reports_resolved_by_users_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_action_intent_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_agent_contract_revision_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM agents WHERE id = OLD.agent_id) THEN
    RETURN OLD;
  END IF;
  RAISE object_not_in_prerequisite_state USING MESSAGE = 'Agent Contract revisions are immutable';
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_agent_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM agents WHERE id = OLD.agent_id) THEN
      RETURN OLD;
    END IF;
    RAISE object_not_in_prerequisite_state USING MESSAGE = 'Agent versions are immutable';
  END IF;
  IF (to_jsonb(OLD) - 'published_at') IS DISTINCT FROM (to_jsonb(NEW) - 'published_at') OR (OLD.published_at IS NOT NULL AND OLD.published_at IS DISTINCT FROM NEW.published_at) THEN
    RAISE object_not_in_prerequisite_state USING MESSAGE = 'Agent versions are immutable';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_approval_decision_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_approval_request_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
			AND (NEW.approver_emails IS NOT NULL OR NEW.status = 'pending') -- NOSONAR
		)
		OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
		OR OLD.timeout_action IS DISTINCT FROM NEW.timeout_action
		OR OLD.action_intent_digest IS DISTINCT FROM NEW.action_intent_digest
		OR OLD.requested_at IS DISTINCT FROM NEW.requested_at
		OR (
			OLD.display IS DISTINCT FROM NEW.display
			AND NEW.display IS DISTINCT FROM '{"title":"Content expired"}'::jsonb -- NOSONAR
		) THEN
		RAISE EXCEPTION 'Approval Request snapshots are immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_connection_authority_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id OR OLD.environment_id IS DISTINCT FROM NEW.environment_id OR OLD.connection_id IS DISTINCT FROM NEW.connection_id OR OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id OR OLD.created_at IS DISTINCT FROM NEW.created_at OR (OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) THEN
  RAISE EXCEPTION 'Connection authority identity and revocation are immutable' USING ERRCODE = '55000';
 END IF;
 RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_workflow_contract_revision_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	IF TG_OP = 'DELETE' AND (NOT EXISTS (SELECT 1 FROM workflows WHERE id = OLD.workflow_id) OR NOT EXISTS (SELECT 1 FROM organizations WHERE id = OLD.workspace_id)) THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'Workflow Contract revisions are immutable' USING ERRCODE = '55000';
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_workflow_version_contract_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	IF OLD.workflow_contract_revision_id IS DISTINCT FROM NEW.workflow_contract_revision_id THEN
		RAISE EXCEPTION 'Workflow version Contract compatibility is immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER action_intent_snapshots_immutable BEFORE UPDATE ON public.action_intents FOR EACH ROW EXECUTE FUNCTION prevent_action_intent_snapshot_mutation();
--> statement-breakpoint
CREATE TRIGGER agent_contract_revisions_immutable BEFORE DELETE OR UPDATE ON public.agent_contract_revisions FOR EACH ROW EXECUTE FUNCTION prevent_agent_contract_revision_mutation();
--> statement-breakpoint
CREATE TRIGGER agent_versions_immutable BEFORE DELETE OR UPDATE ON public.agent_versions FOR EACH ROW EXECUTE FUNCTION prevent_agent_version_mutation();
--> statement-breakpoint
CREATE TRIGGER approval_decisions_immutable BEFORE DELETE OR UPDATE ON public.approval_decisions FOR EACH ROW EXECUTE FUNCTION prevent_approval_decision_mutation();
--> statement-breakpoint
CREATE TRIGGER approval_request_snapshots_immutable BEFORE UPDATE ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION prevent_approval_request_snapshot_mutation();
--> statement-breakpoint
CREATE TRIGGER connection_access_grants_immutable BEFORE UPDATE ON public.connection_access_grants FOR EACH ROW EXECUTE FUNCTION prevent_connection_authority_mutation();
--> statement-breakpoint
CREATE TRIGGER connection_reviewer_assignments_immutable BEFORE UPDATE ON public.connection_reviewer_assignments FOR EACH ROW EXECUTE FUNCTION prevent_connection_authority_mutation();
--> statement-breakpoint
CREATE TRIGGER workflow_contract_revisions_immutable BEFORE DELETE OR UPDATE ON public.workflow_contract_revisions FOR EACH ROW EXECUTE FUNCTION prevent_workflow_contract_revision_mutation();
--> statement-breakpoint
CREATE TRIGGER workflow_versions_contract_immutable BEFORE UPDATE ON public.workflow_versions FOR EACH ROW EXECUTE FUNCTION prevent_workflow_version_contract_change();
--> statement-breakpoint
ALTER TABLE "connection_access_grants" ALTER CONSTRAINT "connection_access_grants_membership_fkey" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "connection_reviewer_assignments" ALTER CONSTRAINT "connection_reviewer_assignments_membership_fkey" DEFERRABLE INITIALLY DEFERRED;
