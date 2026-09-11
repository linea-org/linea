ALTER TYPE "audit_action" ADD VALUE 'external_subject.verified' BEFORE 'external_subject.disabled';--> statement-breakpoint
CREATE TABLE "end_user_authorization_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"authorization_code_hash" text,
	"code_verifier_hash" text,
	"external_subject_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_user_authorization_requests_consumed_state_check" CHECK (("consumed_at" IS NULL AND "authorization_code_hash" IS NULL AND "code_verifier_hash" IS NULL) OR ("consumed_at" IS NOT NULL AND "authorization_code_hash" IS NOT NULL AND "code_verifier_hash" IS NOT NULL)),
	CONSTRAINT "end_user_authorization_requests_completed_state_check" CHECK (("completed_at" IS NULL AND "external_subject_id" IS NULL) OR ("completed_at" IS NOT NULL AND "external_subject_id" IS NOT NULL AND "consumed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "end_user_identity_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_authorization_requests_state_hash_uidx" ON "end_user_authorization_requests" ("state_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_authorization_requests_code_hash_uidx" ON "end_user_authorization_requests" ("authorization_code_hash") WHERE "authorization_code_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "end_user_authorization_requests_expiry_idx" ON "end_user_authorization_requests" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_identity_exchanges_token_hash_uidx" ON "end_user_identity_exchanges" ("token_hash");--> statement-breakpoint
CREATE INDEX "end_user_identity_exchanges_expiry_idx" ON "end_user_identity_exchanges" ("expires_at");--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" ADD CONSTRAINT "end_user_authorization_requests_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_authorization_requests" ADD CONSTRAINT "end_user_authorization_requests_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id");--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD CONSTRAINT "end_user_identity_exchanges_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD CONSTRAINT "end_user_identity_exchanges_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;