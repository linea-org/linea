ALTER TABLE "executions" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "agent_version_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "agent_contract_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "output" jsonb;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "next_step_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "workflow_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "workflow_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "workflow_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "action_intents" ALTER COLUMN "workflow_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_workspace_fkey" FOREIGN KEY ("agent_id","workspace_id") REFERENCES "agents"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_version_fkey" FOREIGN KEY ("agent_id","agent_version_id","agent_contract_revision_id") REFERENCES "agent_versions"("agent_id","id","agent_contract_revision_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_contract_fkey" FOREIGN KEY ("agent_id","agent_contract_revision_id","workspace_id") REFERENCES "agent_contract_revisions"("agent_id","id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_root_execution_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_root_execution_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_root_check" CHECK (("workflow_id" IS NOT NULL AND "workflow_version_id" IS NOT NULL AND "agent_id" IS NULL AND "agent_version_id" IS NULL AND "agent_contract_revision_id" IS NULL) OR ("workflow_id" IS NULL AND "workflow_version_id" IS NULL AND "workflow_contract_revision_id" IS NULL AND "conversation_id" IS NULL AND "agent_id" IS NOT NULL AND "agent_version_id" IS NOT NULL AND "agent_contract_revision_id" IS NOT NULL AND "environment_id" IS NOT NULL AND "external_subject_record_id" IS NOT NULL));
--> statement-breakpoint
UPDATE "executions" SET "next_step_sequence" = GREATEST(0, COALESCE((SELECT MAX("sequence") FROM "execution_steps" WHERE "execution_id" = "executions"."id"), 0)) WHERE "id" IS NOT NULL;
