CREATE TYPE "external_subject_status" AS ENUM('provisioned', 'verified', 'disabled', 'erased');--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'external_subject.provisioned' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'external_subject.disabled' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'external_subject.erased' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_resource" ADD VALUE 'external_subject' BEFORE 'member';--> statement-breakpoint
CREATE TABLE "external_subject_applications" (
	"workspace_id" uuid NOT NULL,
	"application_id" uuid,
	"external_subject_id" uuid,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_subject_applications_pkey" PRIMARY KEY("application_id","external_subject_id")
);
--> statement-breakpoint
CREATE TABLE "external_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"issuer_subject" text,
	"status" "external_subject_status" DEFAULT 'provisioned'::"external_subject_status" NOT NULL,
	"audit_reference" uuid DEFAULT gen_random_uuid() NOT NULL,
	"verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_subjects_erasure_state_check" CHECK (("status" = 'erased' AND "issuer_subject" IS NULL AND "erased_at" IS NOT NULL) OR ("status" <> 'erased' AND "issuer_subject" IS NOT NULL AND "erased_at" IS NULL)),
	CONSTRAINT "external_subjects_disabled_state_check" CHECK (("status" IN ('disabled', 'erased') AND "disabled_at" IS NOT NULL) OR ("status" NOT IN ('disabled', 'erased') AND "disabled_at" IS NULL)),
	CONSTRAINT "external_subjects_verified_state_check" CHECK ("status" <> 'verified' OR "verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "external_subject_applications_workspace_idx" ON "external_subject_applications" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_subjects_identity_uidx" ON "external_subjects" ("workspace_id","issuer","issuer_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "external_subjects_id_workspace_uidx" ON "external_subjects" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_subjects_audit_reference_uidx" ON "external_subjects" ("audit_reference");--> statement-breakpoint
CREATE INDEX "external_subjects_workspace_status_idx" ON "external_subjects" ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "external_subject_applications" ADD CONSTRAINT "external_subject_applications_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "external_subject_applications" ADD CONSTRAINT "external_subject_applications_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "external_subjects" ADD CONSTRAINT "external_subjects_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;