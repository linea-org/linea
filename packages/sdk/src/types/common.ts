export type ExecutionStatus =
  | "queued"
  | "running"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"

export type ExecutionOrigin = "native" | "ingested"

export type ExecutionTrigger = "manual" | "schedule" | "webhook" | "api"

// "draft" is reserved for Linea's own builder testing surfaces (Chat Preview, Test Run) and is
// always set server-side — a real caller-triggered execution (via this SDK) is always "dev" or
// "production".
export type ExecutionEnvironment = "draft" | "dev" | "production"

export type SignalEnvironment = "production" | "dev" | "draft"
