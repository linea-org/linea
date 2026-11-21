CREATE TABLE "assistant_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "executions_workspace_active_idx" ON "executions" ("workspace_id") WHERE "status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "execution_steps_workspace_started_idx" ON "execution_steps" ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "assistant_usage_workspace_created_idx" ON "assistant_usage" ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;