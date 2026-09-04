ALTER TYPE "flag_type" ADD VALUE 'user_frustration';--> statement-breakpoint
ALTER TYPE "flag_type" ADD VALUE 'hallucination_suspected';--> statement-breakpoint
ALTER TYPE "flag_type" ADD VALUE 'repetition_loop';--> statement-breakpoint
ALTER TYPE "flag_type" ADD VALUE 'inappropriate_refusal';--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "external_subject_id" text;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "provider" text;--> statement-breakpoint
CREATE INDEX "flags_workspace_subject_created_idx" ON "flags" ("workspace_id","external_subject_id","created_at");