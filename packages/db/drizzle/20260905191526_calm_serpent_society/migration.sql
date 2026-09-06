ALTER TYPE "eval_case_type" RENAME TO "regression_case_type";--> statement-breakpoint
ALTER TYPE "eval_run_trigger" RENAME TO "regression_run_trigger";--> statement-breakpoint
ALTER TYPE "eval_result_status" RENAME TO "regression_result_status";--> statement-breakpoint
ALTER TABLE "eval_cases" RENAME TO "regression_cases";--> statement-breakpoint
ALTER TABLE "eval_runs" RENAME TO "regression_runs";--> statement-breakpoint
ALTER TABLE "eval_results" RENAME TO "regression_results";--> statement-breakpoint
ALTER INDEX "eval_cases_workflow_idx" RENAME TO "regression_cases_workflow_idx";--> statement-breakpoint
ALTER INDEX "eval_runs_workflow_started_idx" RENAME TO "regression_runs_workflow_started_idx";--> statement-breakpoint
ALTER INDEX "eval_runs_id_workspace_uidx" RENAME TO "regression_runs_id_workspace_uidx";--> statement-breakpoint
ALTER INDEX "eval_results_run_idx" RENAME TO "regression_results_run_idx";--> statement-breakpoint
ALTER INDEX "eval_results_case_idx" RENAME TO "regression_results_case_idx";--> statement-breakpoint
ALTER TABLE "regression_cases" RENAME CONSTRAINT "eval_cases_workflow_workspace_fkey" TO "regression_cases_workflow_workspace_fkey";--> statement-breakpoint
ALTER TABLE "regression_runs" RENAME CONSTRAINT "eval_runs_workflow_workspace_fkey" TO "regression_runs_workflow_workspace_fkey";--> statement-breakpoint
ALTER TABLE "regression_runs" RENAME CONSTRAINT "eval_runs_workflow_version_fkey" TO "regression_runs_workflow_version_fkey";--> statement-breakpoint
ALTER TABLE "regression_results" RENAME CONSTRAINT "eval_results_run_workspace_fkey" TO "regression_results_run_workspace_fkey";--> statement-breakpoint
ALTER TABLE "regression_cases" RENAME CONSTRAINT "eval_cases_pkey" TO "regression_cases_pkey";--> statement-breakpoint
ALTER TABLE "regression_runs" RENAME CONSTRAINT "eval_runs_pkey" TO "regression_runs_pkey";--> statement-breakpoint
ALTER TABLE "regression_results" RENAME CONSTRAINT "eval_results_pkey" TO "regression_results_pkey";--> statement-breakpoint
ALTER TABLE "regression_cases" RENAME CONSTRAINT "eval_cases_workspace_id_organizations_id_fkey" TO "regression_cases_workspace_id_organizations_id_fkey";--> statement-breakpoint
ALTER TABLE "regression_runs" RENAME CONSTRAINT "eval_runs_workspace_id_organizations_id_fkey" TO "regression_runs_workspace_id_organizations_id_fkey";
