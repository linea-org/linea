ALTER TABLE "executions" ADD COLUMN "sort_keys_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.touch_execution_sort_keys_changed_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	-- Not now(): a long transaction must not backdate the change to its own start.
	NEW.sort_keys_changed_at := clock_timestamp();
	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER executions_sort_keys_changed_at
BEFORE UPDATE OF status, cost_micros, started_at, completed_at ON executions
FOR EACH ROW
WHEN (
	OLD.status IS DISTINCT FROM NEW.status
	OR OLD.cost_micros IS DISTINCT FROM NEW.cost_micros
	OR OLD.started_at IS DISTINCT FROM NEW.started_at
	OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
)
EXECUTE FUNCTION public.touch_execution_sort_keys_changed_at();
