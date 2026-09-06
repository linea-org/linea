# Use a Postgres outbox as delivery authority

Every business transition that requires execution resume or external event delivery will write an outbox row in the same Postgres transaction, and a dispatcher will publish deterministic, idempotently consumed BullMQ jobs from committed rows. Redis cannot commit atomically with Postgres, so treating BullMQ alone as proof that work must occur leaves a crash window; BullMQ remains the delivery accelerator while Postgres remains authoritative.
