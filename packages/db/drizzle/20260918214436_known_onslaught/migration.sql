CREATE TABLE "connection_authorization_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"end_user_session_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"scopes" text[] NOT NULL,
	"return_uri" text NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_authorization_requests_scopes_check" CHECK (cardinality("scopes") > 0)
);
--> statement-breakpoint
CREATE TABLE "connection_revocation_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"credential_encrypted" text,
	"expires_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"claimed_by" text,
	"claim_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_revocation_deliveries_payload_check" CHECK (("delivered_at" IS NULL AND "credential_encrypted" IS NOT NULL) OR ("delivered_at" IS NOT NULL AND "credential_encrypted" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"account_label" text NOT NULL,
	"status" text NOT NULL,
	"scopes" text[] NOT NULL,
	"credential_encrypted" text,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "connections_status_check" CHECK ("status" IN ('active', 'reauthorization_required', 'revoked')),
	CONSTRAINT "connections_scopes_check" CHECK (cardinality("scopes") > 0),
	CONSTRAINT "connections_credential_state_check" CHECK (("status" = 'active' AND "credential_encrypted" IS NOT NULL AND "revoked_at" IS NULL) OR ("status" = 'reauthorization_required' AND "credential_encrypted" IS NULL AND "revoked_at" IS NULL) OR ("status" = 'revoked' AND "credential_encrypted" IS NULL AND "revoked_at" IS NOT NULL)) -- NOSONAR
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "connector_access_policy" jsonb DEFAULT '{"providers":[]}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_authorization_requests_state_hash_uidx" ON "connection_authorization_requests" ("state_hash");--> statement-breakpoint
CREATE INDEX "connection_authorization_requests_expiry_idx" ON "connection_authorization_requests" ("expires_at");--> statement-breakpoint
CREATE INDEX "connection_revocation_deliveries_pending_idx" ON "connection_revocation_deliveries" ("delivered_at","available_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_active_ownership_uidx" ON "connections" ("workspace_id","application_id","external_subject_id","provider","provider_account_id") WHERE "status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_id_workspace_uidx" ON "connections" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "connections_subject_idx" ON "connections" ("workspace_id","application_id","external_subject_id");--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_authorization_requests" ADD CONSTRAINT "connection_authorization_requests_session_fkey" FOREIGN KEY ("end_user_session_id","workspace_id","application_id","external_subject_id") REFERENCES "end_user_sessions"("id","workspace_id","application_id","external_subject_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connection_revocation_deliveries" ADD CONSTRAINT "connection_revocation_deliveries_connection_fkey" FOREIGN KEY ("connection_id","workspace_id") REFERENCES "connections"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;
