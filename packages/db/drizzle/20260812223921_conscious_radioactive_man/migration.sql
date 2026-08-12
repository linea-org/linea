CREATE TYPE "flag_type" AS ENUM('retry_storm', 'branch_never_taken', 'cost_jump', 'excess_resumes');--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid,
	"execution_id" uuid,
	"node_id" text,
	"flag_type" "flag_type" NOT NULL,
	"detail" jsonb,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "flags_dedupe_key_uidx" ON "flags" ("dedupe_key");