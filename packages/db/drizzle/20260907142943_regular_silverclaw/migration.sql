CREATE TYPE "approval_audience" AS ENUM('workspace', 'external_subject');--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "audience" "approval_audience" DEFAULT 'workspace'::"approval_audience" NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "external_subject_id" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "responded_by_external_subject_id" text;