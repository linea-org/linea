CREATE TYPE "chat_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"execution_id" uuid,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" ("conversation_id","created_at");