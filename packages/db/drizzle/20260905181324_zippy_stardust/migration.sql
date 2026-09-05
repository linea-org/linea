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
CREATE UNIQUE INDEX "evaluator_metric_steps_version_node_metric_revision_uidx" ON "evaluator_metric_steps" ("workflow_version_id","node_id","metric_id","metric_revision");--> statement-breakpoint
ALTER TABLE "evaluator_metric_steps" ADD CONSTRAINT "evaluator_metric_steps_EES7C90sSUr1_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE;