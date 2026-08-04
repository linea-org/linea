CREATE TYPE "execution_origin" AS ENUM('native', 'ingested');--> statement-breakpoint
CREATE TYPE "execution_status" AS ENUM('queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "execution_trigger" AS ENUM('manual', 'schedule', 'webhook', 'api');--> statement-breakpoint
CREATE TYPE "step_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "api_key_purpose" AS ENUM('platform', 'ingest');--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"published_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"status" "execution_status" DEFAULT 'queued'::"execution_status" NOT NULL,
	"origin" "execution_origin" DEFAULT 'native'::"execution_origin" NOT NULL,
	"trigger" "execution_trigger" NOT NULL,
	"trigger_payload" jsonb,
	"leased_by" text,
	"lease_expires_at" timestamp with time zone,
	"error" jsonb,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
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
	"replayed_from_step_id" uuid
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"completed_step_ids" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"cron_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
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
	"purpose" "api_key_purpose" DEFAULT 'platform'::"api_key_purpose" NOT NULL,
	"hashed_key" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_version_uidx" ON "workflow_versions" ("workflow_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_workspace_slug_uidx" ON "workflows" ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "workflows_workspace_idx" ON "workflows" ("workspace_id");--> statement-breakpoint
CREATE INDEX "executions_workflow_created_idx" ON "executions" ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "executions_workspace_created_idx" ON "executions" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "executions_lease_claim_idx" ON "executions" ("status","lease_expires_at") WHERE "status" = 'running';--> statement-breakpoint
CREATE INDEX "execution_steps_execution_seq_idx" ON "execution_steps" ("execution_id","sequence");--> statement-breakpoint
CREATE INDEX "execution_steps_trace_idx" ON "execution_steps" ("trace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_steps_idempotency_uidx" ON "execution_steps" ("execution_id","idempotency_key") WHERE "idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_execution_sequence_uidx" ON "checkpoints" ("execution_id","sequence");--> statement-breakpoint
CREATE INDEX "schedules_next_run_idx" ON "schedules" ("next_run_at") WHERE "enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_workspace_key_uidx" ON "secrets" ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hashed_key_uidx" ON "api_keys" ("hashed_key");--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_published_version_id_workflow_versions_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "workflow_versions"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_version_id_workflow_versions_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id");--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_replayed_from_step_id_execution_steps_id_fkey" FOREIGN KEY ("replayed_from_step_id") REFERENCES "execution_steps"("id");--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;