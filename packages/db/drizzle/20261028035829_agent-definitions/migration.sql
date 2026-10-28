CREATE TABLE "agent_contract_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"agent_contract_revision_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_agent_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_contract_revision_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_contract_revisions_agent_revision_uidx" ON "agent_contract_revisions" ("agent_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_contract_revisions_agent_id_uidx" ON "agent_contract_revisions" ("agent_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_contract_revisions_scope_uidx" ON "agent_contract_revisions" ("agent_id","id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_uidx" ON "agent_versions" ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_deployment_scope_uidx" ON "agent_versions" ("agent_id","id","agent_contract_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_application_slug_uidx" ON "agents" ("application_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_id_workspace_uidx" ON "agents" ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_id_application_workspace_uidx" ON "agents" ("id","application_id","workspace_id");--> statement-breakpoint
CREATE INDEX "agents_workspace_idx" ON "agents" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_agent_bindings_environment_agent_uidx" ON "environment_agent_bindings" ("environment_id","agent_id");--> statement-breakpoint
CREATE INDEX "environment_agent_bindings_workspace_idx" ON "environment_agent_bindings" ("workspace_id");--> statement-breakpoint
ALTER TABLE "agent_contract_revisions" ADD CONSTRAINT "agent_contract_revisions_agent_fkey" FOREIGN KEY ("agent_id","workspace_id") REFERENCES "agents"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_contract_revision_fkey" FOREIGN KEY ("agent_id","agent_contract_revision_id") REFERENCES "agent_contract_revisions"("agent_id","id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_environment_fkey" FOREIGN KEY ("environment_id","application_id","workspace_id") REFERENCES "environments"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_agent_fkey" FOREIGN KEY ("agent_id","application_id","workspace_id") REFERENCES "agents"("id","application_id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_version_fkey" FOREIGN KEY ("agent_id","agent_version_id","agent_contract_revision_id") REFERENCES "agent_versions"("agent_id","id","agent_contract_revision_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_agent_bindings" ADD CONSTRAINT "environment_agent_bindings_contract_revision_fkey" FOREIGN KEY ("agent_id","agent_contract_revision_id","workspace_id") REFERENCES "agent_contract_revisions"("agent_id","id","workspace_id");
--> statement-breakpoint
CREATE FUNCTION prevent_agent_contract_revision_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM agents WHERE id = OLD.agent_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Agent Contract revisions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_contract_revisions_immutable BEFORE UPDATE OR DELETE ON agent_contract_revisions FOR EACH ROW EXECUTE FUNCTION prevent_agent_contract_revision_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_agent_version_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM agents WHERE id = OLD.agent_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Agent versions are immutable' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(OLD) - 'published_at') IS DISTINCT FROM (to_jsonb(NEW) - 'published_at') OR (OLD.published_at IS NOT NULL AND OLD.published_at IS DISTINCT FROM NEW.published_at) THEN
    RAISE EXCEPTION 'Agent versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_versions_immutable BEFORE UPDATE OR DELETE ON agent_versions FOR EACH ROW EXECUTE FUNCTION prevent_agent_version_mutation();
