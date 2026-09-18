CREATE TYPE "push_delivery_status" AS ENUM('pending', 'sending', 'receipt_pending', 'receipt_checking', 'retry', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "push_platform" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"notification_id" uuid NOT NULL,
	"device_registration_id" uuid,
	"status" "push_delivery_status" DEFAULT 'pending'::"push_delivery_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"receipt_attempts" integer DEFAULT 0 NOT NULL,
	"ticket_id" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_device_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_deliveries_notification_device_idx" ON "push_deliveries" ("notification_id","device_registration_id");--> statement-breakpoint
CREATE INDEX "push_deliveries_dispatch_idx" ON "push_deliveries" ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_device_registrations_token_idx" ON "push_device_registrations" ("token");--> statement-breakpoint
CREATE INDEX "push_device_registrations_user_idx" ON "push_device_registrations" ("user_id");--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_49TQlqMFpEFz_fkey" FOREIGN KEY ("device_registration_id") REFERENCES "push_device_registrations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "push_device_registrations" ADD CONSTRAINT "push_device_registrations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;