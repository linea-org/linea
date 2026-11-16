CREATE TYPE "workflow_template_visibility" AS ENUM('workspace', 'public');--> statement-breakpoint
CREATE TABLE "workflow_template_stars" (
	"template_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_template_stars_pkey" PRIMARY KEY("template_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"author_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"visibility" "workflow_template_visibility" DEFAULT 'workspace'::"workflow_template_visibility" NOT NULL,
	"star_count" integer DEFAULT 0 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workflow_templates_workspace_created_idx" ON "workflow_templates" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_templates_visibility_stars_idx" ON "workflow_templates" ("visibility","star_count");--> statement-breakpoint
ALTER TABLE "workflow_template_stars" ADD CONSTRAINT "workflow_template_stars_template_id_workflow_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_template_stars" ADD CONSTRAINT "workflow_template_stars_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;