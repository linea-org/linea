ALTER TABLE "executions" ALTER COLUMN "cost_unpriced" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "cost_unpriced" DROP NOT NULL;