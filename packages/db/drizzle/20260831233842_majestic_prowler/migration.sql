CREATE TABLE "conversation_analysis_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_analysis_claims_conversation_uidx" ON "conversation_analysis_claims" ("workspace_id","workflow_id","conversation_id");