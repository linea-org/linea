CREATE TYPE "approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "approval_timeout_action" AS ENUM('auto_reject', 'auto_approve');--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'execution.approval_requested' BEFORE 'system.info';--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending'::"approval_status" NOT NULL,
	"message" text,
	"approver_emails" jsonb,
	"timeout_at" timestamp with time zone,
	"timeout_action" "approval_timeout_action",
	"responded_by" uuid,
	"comment" text,
	"responded_at" timestamp with time zone,
	"timed_out" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_execution_node_uidx" ON "approvals" ("execution_id","node_id");--> statement-breakpoint
CREATE INDEX "approvals_workspace_status_idx" ON "approvals" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "approvals_timeout_idx" ON "approvals" ("timeout_at") WHERE "status" = 'pending';