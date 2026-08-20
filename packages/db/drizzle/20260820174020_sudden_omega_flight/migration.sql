CREATE TABLE "tool_call_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"occurrence" integer NOT NULL,
	"status" integer NOT NULL,
	"body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tool_call_records_execution_node_hash_occurrence_uidx" ON "tool_call_records" ("execution_id","node_id","content_hash","occurrence");--> statement-breakpoint
ALTER TABLE "tool_call_records" ADD CONSTRAINT "tool_call_records_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;