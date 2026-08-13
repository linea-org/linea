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
ALTER TABLE "flags" ADD COLUMN "signal_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_signal_key_uidx" ON "signals" ("signal_key");--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;