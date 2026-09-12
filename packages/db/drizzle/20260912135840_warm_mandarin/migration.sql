CREATE TABLE "end_user_session_proofs" (
	"session_id" uuid,
	"jti_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_user_session_proofs_pkey" PRIMARY KEY("session_id","jti_hash")
);
--> statement-breakpoint
CREATE TABLE "end_user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"external_subject_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"proof_jkt" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_user_sessions_last_used_check" CHECK ("last_used_at" IS NULL OR "last_used_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "end_user_identity_exchanges" ADD COLUMN "dpop_nonce_hash" text;--> statement-breakpoint
CREATE INDEX "end_user_session_proofs_expiry_idx" ON "end_user_session_proofs" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_token_hash_uidx" ON "end_user_sessions" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "end_user_sessions_id_workspace_uidx" ON "end_user_sessions" ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "end_user_sessions_application_subject_idx" ON "end_user_sessions" ("application_id","external_subject_id");--> statement-breakpoint
CREATE INDEX "end_user_sessions_expiry_idx" ON "end_user_sessions" ("expires_at");--> statement-breakpoint
ALTER TABLE "end_user_session_proofs" ADD CONSTRAINT "end_user_session_proofs_session_id_end_user_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "end_user_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_sessions" ADD CONSTRAINT "end_user_sessions_application_fkey" FOREIGN KEY ("application_id","workspace_id") REFERENCES "applications"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "end_user_sessions" ADD CONSTRAINT "end_user_sessions_subject_fkey" FOREIGN KEY ("external_subject_id","workspace_id") REFERENCES "external_subjects"("id","workspace_id") ON DELETE CASCADE;