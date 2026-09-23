ALTER TABLE "connection_revocation_deliveries" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD COLUMN "external_subject_id" uuid;--> statement-breakpoint
UPDATE "connection_revocation_deliveries" AS "delivery"
SET "application_id" = "connection"."application_id",
    "external_subject_id" = "connection"."external_subject_id"
FROM "connections" AS "connection"
WHERE "delivery"."connection_id" = "connection"."id";--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ALTER COLUMN "application_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ALTER COLUMN "external_subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;
