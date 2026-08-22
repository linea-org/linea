CREATE TYPE "execution_environment" AS ENUM('draft', 'dev', 'production');--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"external_subject_id" text NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "environment" "execution_environment" DEFAULT 'dev'::"execution_environment" NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "external_subject_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "memories_scope_key_uidx" ON "memories" ("workspace_id","external_subject_id","namespace","key");--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;