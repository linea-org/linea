CREATE TYPE "assistant_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workflow_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" bigserial,
	"role" "assistant_message_role" NOT NULL,
	"content" text NOT NULL,
	"proposal" jsonb,
	"actions" jsonb DEFAULT '[]' NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_conversations_id_workspace_uidx" ON "assistant_conversations" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "assistant_conversations_owner_updated_idx" ON "assistant_conversations" ("workspace_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_sequence_idx" ON "assistant_messages" ("conversation_id","sequence");--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_fkey" FOREIGN KEY ("conversation_id","workspace_id") REFERENCES "assistant_conversations"("id","workspace_id") ON DELETE CASCADE;