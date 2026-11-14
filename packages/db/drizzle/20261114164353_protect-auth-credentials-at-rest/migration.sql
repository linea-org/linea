-- Social provider tokens are no longer stored (nothing reads them); drop the ones already at rest.
UPDATE "accounts" SET "access_token" = NULL, "refresh_token" = NULL, "id_token" = NULL WHERE "access_token" IS NOT NULL OR "refresh_token" IS NOT NULL OR "id_token" IS NOT NULL;--> statement-breakpoint
-- Reset tokens written before identifiers were hashed are plaintext; invalidate them (1h TTL) rather than re-key them.
DELETE FROM "verifications" WHERE "identifier" LIKE 'reset-password:%';
