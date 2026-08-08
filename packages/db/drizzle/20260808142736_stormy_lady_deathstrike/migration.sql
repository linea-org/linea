ALTER TABLE "execution_steps" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
-- Backfill existing rows with distinct, monotonically increasing values ordered by ctid
-- (physical storage order). execution_steps is insert-only — nothing ever updates a row in
-- place — so ctid order matches insertion order closely enough to break startedAt ties among
-- pre-existing rows, instead of collapsing every historical row onto one identical timestamp.
UPDATE "execution_steps" AS "es" SET "created_at" = "backfill"."value" FROM (
  SELECT "id", now() + (row_number() OVER (ORDER BY "ctid") * interval '1 microsecond') AS "value"
  FROM "execution_steps"
) AS "backfill"
WHERE "es"."id" = "backfill"."id";--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "created_at" SET NOT NULL;