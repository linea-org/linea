CREATE TYPE "application_key_scope" AS ENUM('subjects:provision', 'executions:read', 'executions:start', 'executions:cancel', 'conversations:read', 'conversations:write', 'events:read', 'webhooks:read');--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application_key.created' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application_key.rotated' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application_key.revoked' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application_key.used' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application_key.scope_denied' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'application_key.cross_application_access_denied' BEFORE 'member.invited';--> statement-breakpoint
ALTER TYPE "audit_resource" ADD VALUE 'application_key' BEFORE 'member';--> statement-breakpoint
CREATE TABLE "application_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scopes" "application_key_scope"[] NOT NULL,
	"hashed_key" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_application_key_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "application_keys_hashed_key_uidx" ON "application_keys" ("hashed_key");--> statement-breakpoint
CREATE INDEX "application_keys_application_created_idx" ON "application_keys" ("application_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_application_key_id_application_keys_id_fkey" FOREIGN KEY ("actor_application_key_id") REFERENCES "application_keys"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "application_keys" ADD CONSTRAINT "application_keys_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;