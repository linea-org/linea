CREATE TYPE "workspace_key_scope" AS ENUM('workflows:read', 'workflows:write', 'workflows:publish', 'applications:read', 'executions:read', 'executions:start', 'signals:read', 'signals:write', 'regressions:read', 'regressions:write', 'audit:read');--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" "workspace_key_scope"[];--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
-- Keys minted before scopes existed keep every scope they could already exercise, but must be re-issued within 30 days.
UPDATE "api_keys" SET "scopes" = enum_range(NULL::"workspace_key_scope"), "expires_at" = now() + interval '30 days';--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "scopes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "purpose";--> statement-breakpoint
CREATE INDEX "api_keys_creator_idx" ON "api_keys" ("workspace_id","created_by_user_id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
DROP TYPE "api_key_purpose";
