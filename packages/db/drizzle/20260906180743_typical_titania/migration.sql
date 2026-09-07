ALTER TABLE "conversation_analyses" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD COLUMN "tokens_input" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD COLUMN "tokens_output" integer DEFAULT 0 NOT NULL;