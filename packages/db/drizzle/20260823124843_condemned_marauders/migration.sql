CREATE TABLE "workspace_settings" (
	"workspace_id" uuid PRIMARY KEY,
	"behaviour_analysis_enabled" boolean DEFAULT false NOT NULL,
	"behaviour_sample_rate" real DEFAULT 1 NOT NULL,
	"behaviour_model" text,
	"retention_days" integer,
	"redaction_rules" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_subject_id" text,
	"analyzed_through_sequence" bigint NOT NULL,
	"analyzer_version" text NOT NULL,
	"model" text,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"analysis_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"category" text NOT NULL,
	"confidence" real NOT NULL,
	"evidence_message_id" uuid,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_analyses_conversation_created_idx" ON "conversation_analyses" ("workspace_id","workflow_id","conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_analyses_id_workspace_uidx" ON "conversation_analyses" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "conversation_findings_analysis_idx" ON "conversation_findings" ("analysis_id");--> statement-breakpoint
CREATE INDEX "conversation_findings_workspace_category_idx" ON "conversation_findings" ("workspace_id","category","created_at");--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_findings" ADD CONSTRAINT "conversation_findings_analysis_workspace_fkey" FOREIGN KEY ("analysis_id","workspace_id") REFERENCES "conversation_analyses"("id","workspace_id") ON DELETE CASCADE;