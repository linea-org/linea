export const flagTypeLabel: Record<string, string> = {
  retry_storm: "Retry storm",
  branch_never_taken: "Branch never taken",
  cost_jump: "Cost jump",
  excess_resumes: "Excess resumes",
  tool_error: "Tool error",
  empty_response: "Empty response",
  refusal: "Refusal",
  repeated_replay: "Repeated replay",
  // Raised by the behaviour-to-flag bridge (apps/background-worker's ConversationAnalyzerService)
  // from a curated subset of conversation_findings categories — see packages/db/src/schema/flag.ts.
  user_frustration: "User frustration",
  hallucination_suspected: "Hallucination suspected",
  repetition_loop: "Repetition loop",
  inappropriate_refusal: "Inappropriate refusal",
}
