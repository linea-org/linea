CREATE TYPE "webhook_delivery_status" AS ENUM('pending', 'delivering', 'retrying', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "webhook_secret_version" AS ENUM('current', 'previous');--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'webhook.rotated' BEFORE 'integration.connected';--> statement-breakpoint
ALTER TYPE "audit_resource" ADD VALUE 'webhook';--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"url" text NOT NULL,
	"current_secret_encrypted" text NOT NULL,
	"previous_secret_encrypted" text,
	"previous_secret_expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_previous_secret_check" CHECK (("previous_secret_encrypted" IS NULL) = ("previous_secret_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" "outbox_event_type" NOT NULL,
	"url" text NOT NULL,
	"body" text NOT NULL,
	"secret_version" "webhook_secret_version" DEFAULT 'current'::"webhook_secret_version" NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending'::"webhook_delivery_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "webhook_deliveries_body_check" CHECK (octet_length("body") <= 65536),
	CONSTRAINT "webhook_deliveries_terminal_check" CHECK (("status" = 'succeeded') = ("delivered_at" IS NOT NULL) AND ("status" = 'failed') = ("failed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_id_application_uidx" ON "webhook_endpoints" ("id","application_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_application_idx" ON "webhook_endpoints" ("application_id","disabled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_webhook_event_uidx" ON "webhook_deliveries" ("webhook_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_application_created_idx" ON "webhook_deliveries" ("application_id","created_at","id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_retention_idx" ON "webhook_deliveries" ("created_at");--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_outbox_messages_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_fkey" FOREIGN KEY ("webhook_id","application_id") REFERENCES "webhook_endpoints"("id","application_id") ON DELETE CASCADE;