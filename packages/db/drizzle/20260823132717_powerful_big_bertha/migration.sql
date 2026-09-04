CREATE TYPE "eval_case_type" AS ENUM('node', 'conversation');--> statement-breakpoint
CREATE TYPE "eval_run_trigger" AS ENUM('publish', 'manual');--> statement-breakpoint
CREATE TYPE "eval_result_status" AS ENUM('passed', 'failed', 'errored');--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"case_type" "eval_case_type" NOT NULL,
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
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"trigger" "eval_run_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"status" "eval_result_status" NOT NULL,
	"score" real,
	"output" jsonb,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eval_cases_workflow_idx" ON "eval_cases" ("workspace_id","workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_runs_workflow_started_idx" ON "eval_runs" ("workspace_id","workflow_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_id_workspace_uidx" ON "eval_runs" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "eval_results_run_idx" ON "eval_results" ("run_id");--> statement-breakpoint
CREATE INDEX "eval_results_case_idx" ON "eval_results" ("case_id");--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workflow_version_fkey" FOREIGN KEY ("workflow_id","workflow_version_id") REFERENCES "workflow_versions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_workspace_fkey" FOREIGN KEY ("run_id","workspace_id") REFERENCES "eval_runs"("id","workspace_id") ON DELETE CASCADE;