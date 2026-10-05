-- Defer membership checks until connection cascades finish during workspace deletion.
ALTER TABLE "connection_access_grants" ALTER CONSTRAINT "connection_access_grants_membership_fkey" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "connection_reviewer_assignments" ALTER CONSTRAINT "connection_reviewer_assignments_membership_fkey" DEFERRABLE INITIALLY DEFERRED;
