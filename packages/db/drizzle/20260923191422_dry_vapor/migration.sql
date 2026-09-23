ALTER TABLE "connection_revocation_deliveries" ADD COLUMN "provider_account_id" text;--> statement-breakpoint
UPDATE "connection_revocation_deliveries" AS delivery SET "provider_account_id" = connection."provider_account_id" FROM "connections" AS connection WHERE delivery."connection_id" = connection."id";--> statement-breakpoint
CREATE INDEX "connection_revocation_deliveries_account_idx" ON "connection_revocation_deliveries" ("provider","provider_account_id");
