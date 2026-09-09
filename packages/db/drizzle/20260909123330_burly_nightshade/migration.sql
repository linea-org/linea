CREATE TYPE "application_environment" AS ENUM('dev', 'production');--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application.created' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application.updated' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application.trust_configuration_updated' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application.disabled' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_resource" ADD VALUE 'application' BEFORE 'member';--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment" "application_environment" NOT NULL,
	"display_name" text NOT NULL,
	"logo_url" text,
	"allowed_browser_origins" text[] NOT NULL,
	"allowed_redirect_origins" text[] NOT NULL,
	"content_retention_days" integer DEFAULT 30 NOT NULL,
	"oidc_issuer" text NOT NULL,
	"oidc_client_id" text NOT NULL,
	"oidc_audience" text NOT NULL,
	"oidc_jwks_url" text NOT NULL,
	"oidc_subject_claim" text DEFAULT 'sub' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_content_retention_days_check" CHECK ("content_retention_days" BETWEEN 1 AND 3650),
	CONSTRAINT "applications_browser_origins_check" CHECK (cardinality("allowed_browser_origins") > 0),
	CONSTRAINT "applications_redirect_origins_check" CHECK (cardinality("allowed_redirect_origins") > 0)
);
--> statement-breakpoint
CREATE INDEX "applications_workspace_idx" ON "applications" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_id_workspace_uidx" ON "applications" ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;