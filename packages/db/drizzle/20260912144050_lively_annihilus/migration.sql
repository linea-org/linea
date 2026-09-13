CREATE TYPE "application_kind" AS ENUM('operator', 'internal_builder');--> statement-breakpoint
CREATE TYPE "conversation_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"external_thread_key" text,
	"title" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"environment" "execution_environment" NOT NULL,
	"status" "conversation_status" DEFAULT 'active'::"conversation_status" NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_thread_key_length_check" CHECK ("external_thread_key" IS NULL OR char_length("external_thread_key") BETWEEN 1 AND 256),
	CONSTRAINT "conversations_title_length_check" CHECK ("title" IS NULL OR char_length("title") BETWEEN 1 AND 200),
	CONSTRAINT "conversations_metadata_size_check" CHECK (octet_length("metadata"::text) <= 16384)
);
--> statement-breakpoint
DROP INDEX "chat_messages_conversation_created_idx";--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "kind" "application_kind" DEFAULT 'operator'::"application_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "client_message_id" text;--> statement-breakpoint
INSERT INTO "applications" (
	"workspace_id", "kind", "environment", "display_name", "allowed_browser_origins",
	"allowed_redirect_origins", "oidc_issuer", "oidc_client_id", "oidc_audience", "oidc_jwks_url", "enabled"
)
SELECT DISTINCT
	cm."workspace_id", 'internal_builder'::"application_kind", 'dev'::"application_environment", 'Linea Builder', ARRAY['http://localhost'],
	ARRAY['http://localhost'], 'urn:linea:builder', 'linea-builder', 'linea-builder',
	'http://localhost/.well-known/jwks.json', false
FROM "chat_messages" cm
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "external_subjects" (
	"workspace_id", "issuer", "issuer_subject", "status", "verified_at"
)
SELECT DISTINCT
	cm."workspace_id", 'urn:linea:builder',
	coalesce(cm."external_subject_id", 'anonymous:' || cm."conversation_id"::text),
	'verified'::"external_subject_status", now()
FROM "chat_messages" cm
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "external_subject_applications" (
	"workspace_id", "application_id", "external_subject_id"
)
SELECT DISTINCT cm."workspace_id", a."id", es."id"
FROM "chat_messages" cm
JOIN "applications" a
	ON a."workspace_id" = cm."workspace_id" AND a."kind" = 'internal_builder'
JOIN "external_subjects" es
	ON es."workspace_id" = cm."workspace_id"
	AND es."issuer" = 'urn:linea:builder'
	AND es."issuer_subject" = coalesce(cm."external_subject_id", 'anonymous:' || cm."conversation_id"::text)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "conversations" (
	"id", "workspace_id", "application_id", "workflow_id", "external_subject_id",
	"environment", "last_activity_at", "created_at", "updated_at"
)
SELECT
	cm."conversation_id", cm."workspace_id", a."id", cm."workflow_id", es."id",
	'draft'::"execution_environment", max(cm."created_at"), min(cm."created_at"), max(cm."created_at")
FROM "chat_messages" cm
JOIN "applications" a
	ON a."workspace_id" = cm."workspace_id" AND a."kind" = 'internal_builder'
JOIN "external_subjects" es
	ON es."workspace_id" = cm."workspace_id"
	AND es."issuer" = 'urn:linea:builder'
	AND es."issuer_subject" = coalesce(cm."external_subject_id", 'anonymous:' || cm."conversation_id"::text)
GROUP BY cm."conversation_id", cm."workspace_id", a."id", cm."workflow_id", es."id";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN "workflow_id";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN "external_subject_id";--> statement-breakpoint
CREATE UNIQUE INDEX "applications_internal_builder_workspace_uidx" ON "applications" ("workspace_id") WHERE "kind" = 'internal_builder';--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_workspace_uidx" ON "conversations" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_workspace_workflow_uidx" ON "conversations" ("id","workspace_id","workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_application_thread_uidx" ON "conversations" ("application_id","external_thread_key") WHERE "external_thread_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_subject_activity_idx" ON "conversations" ("application_id","external_subject_id","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_conversation_client_message_uidx" ON "chat_messages" ("conversation_id","client_message_id") WHERE "client_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_sequence_idx" ON "chat_messages" ("conversation_id","sequence");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_subject_application_fkey" FOREIGN KEY ("application_id","external_subject_id") REFERENCES "external_subject_applications"("application_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id") REFERENCES "conversations"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_analysis_claims" ADD CONSTRAINT "conversation_analysis_claims_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id","workflow_id") REFERENCES "conversations"("id","workspace_id","workflow_id") ON DELETE CASCADE;
