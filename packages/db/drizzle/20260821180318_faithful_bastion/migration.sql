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
CREATE UNIQUE INDEX "wait_timers_execution_node_uidx" ON "wait_timers" ("execution_id","node_id");--> statement-breakpoint
CREATE INDEX "wait_timers_workspace_fired_idx" ON "wait_timers" ("workspace_id","fired");--> statement-breakpoint
CREATE INDEX "wait_timers_resume_at_idx" ON "wait_timers" ("resume_at") WHERE "fired" = false;