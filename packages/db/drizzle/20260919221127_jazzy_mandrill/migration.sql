ALTER TABLE "action_intents" ADD COLUMN "execution_claim_id" text;--> statement-breakpoint
ALTER TABLE "action_intents" ADD COLUMN "dispatch_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_intents" ADD COLUMN "provider_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_execution_claim_check" CHECK (("status" IN ('executing', 'succeeded', 'failed', 'stale', 'outcome_unknown')) = ("execution_claim_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_dispatch_check" CHECK ("provider_attempt_count" >= 0 AND ("dispatch_started_at" IS NULL) = ("provider_attempt_count" = 0));