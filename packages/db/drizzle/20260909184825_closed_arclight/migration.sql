CREATE TABLE "workflow_contract_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_workflow_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_contract_revision_id" uuid NOT NULL,
	"allow_backend_start" boolean DEFAULT false NOT NULL,
	"allow_end_user_start" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD COLUMN "workflow_contract_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "workflow_contract_revision_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_contract_revisions_workflow_revision_uidx" ON "workflow_contract_revisions" ("workflow_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_contract_revisions_workflow_id_uidx" ON "workflow_contract_revisions" ("workflow_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_contract_revisions_scope_uidx" ON "workflow_contract_revisions" ("workflow_id","id","workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_contract_revisions_workspace_idx" ON "workflow_contract_revisions" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_workflow_bindings_application_workflow_uidx" ON "application_workflow_bindings" ("application_id","workflow_id");--> statement-breakpoint
CREATE INDEX "application_workflow_bindings_workspace_idx" ON "application_workflow_bindings" ("workspace_id");--> statement-breakpoint
ALTER TABLE "workflow_contract_revisions" ADD CONSTRAINT "workflow_contract_revisions_workspace_id_organizations_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_contract_revisions" ADD CONSTRAINT "workflow_contract_revisions_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id") REFERENCES "workflow_contract_revisions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id") REFERENCES "workflow_contract_revisions"("workflow_id","id");--> statement-breakpoint
ALTER TABLE "application_workflow_bindings" ADD CONSTRAINT "application_workflow_bindings_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_workflow_bindings" ADD CONSTRAINT "application_workflow_bindings_workflow_fkey" FOREIGN KEY ("workflow_id","workspace_id") REFERENCES "workflows"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_workflow_bindings" ADD CONSTRAINT "application_workflow_bindings_contract_revision_fkey" FOREIGN KEY ("workflow_id","workflow_contract_revision_id","workspace_id") REFERENCES "workflow_contract_revisions"("workflow_id","id","workspace_id");
--> statement-breakpoint
CREATE FUNCTION prevent_workflow_contract_revision_update() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'Workflow Contract revisions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER workflow_contract_revisions_immutable
	BEFORE UPDATE ON "workflow_contract_revisions"
	FOR EACH ROW EXECUTE FUNCTION prevent_workflow_contract_revision_update();
--> statement-breakpoint
CREATE FUNCTION prevent_workflow_version_contract_change() RETURNS trigger AS $$
BEGIN
	IF OLD.workflow_contract_revision_id IS DISTINCT FROM NEW.workflow_contract_revision_id THEN
		RAISE EXCEPTION 'Workflow version Contract compatibility is immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER workflow_versions_contract_immutable
	BEFORE UPDATE ON "workflow_versions"
	FOR EACH ROW EXECUTE FUNCTION prevent_workflow_version_contract_change();
