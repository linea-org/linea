ALTER TABLE "workflows" DROP CONSTRAINT "workflows_published_version_id_workflow_versions_id_fkey";--> statement-breakpoint
ALTER TABLE "executions" DROP CONSTRAINT "executions_workflow_id_workflows_id_fkey";--> statement-breakpoint
ALTER TABLE "executions" DROP CONSTRAINT "executions_workflow_version_id_workflow_versions_id_fkey";--> statement-breakpoint
ALTER TABLE "execution_steps" DROP CONSTRAINT "execution_steps_execution_id_executions_id_fkey";--> statement-breakpoint
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_workflow_id_workflows_id_fkey";--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_id_id_uidx" ON "workflow_versions" ("workflow_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_id_workspace_uidx" ON "workflows" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_id_workspace_uidx" ON "executions" ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_published_version_fkey" FOREIGN KEY ("id","published_version_id") REFERENCES "workflow_versions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_version_fkey" FOREIGN KEY ("workflow_id","workflow_version_id") REFERENCES "workflow_versions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_workspace_fkey" FOREIGN KEY ("execution_id","workspace_id") REFERENCES "executions"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workflow_workspace_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;