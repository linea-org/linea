CREATE TABLE "ai_node_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"conversation" jsonb NOT NULL,
	"iteration" integer NOT NULL,
	"tokens_input" integer NOT NULL,
	"tokens_output" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_node_progress_execution_node_uidx" ON "ai_node_progress" ("execution_id","node_id");--> statement-breakpoint
ALTER TABLE "ai_node_progress" ADD CONSTRAINT "ai_node_progress_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;