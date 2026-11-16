ALTER TABLE "assistant_messages" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_parent_id_assistant_messages_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "assistant_messages"("id") ON DELETE CASCADE;
UPDATE "assistant_messages" AS m
SET "parent_id" = ordered."previous_id"
FROM (
  SELECT "id", lag("id") OVER (PARTITION BY "conversation_id" ORDER BY "sequence") AS "previous_id"
  FROM "assistant_messages"
) AS ordered
WHERE m."id" = ordered."id" AND ordered."previous_id" IS NOT NULL;
