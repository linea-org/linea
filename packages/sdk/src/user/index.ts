export {
  LineaUserClient,
  type LineaUserClientOptions,
  type LineaUserSession,
  type StartAuthorizationInput,
  type CompleteAuthorizationInput,
  type StreamEventsOptions,
  type UserEventUpdate,
} from "./user-client.js"
export { LineaExecutionHandle } from "./execution-handle.js"
export {
  LineaUserApiError,
  LineaUserNetworkError,
  LineaUserProtocolError,
  LineaUserSessionError,
} from "./errors.js"
export type {
  ApprovalDecision,
  ApprovalRequest,
  ConversationProjection,
  CreateEndUserConversation,
  CreateMessage,
  DecideApprovalRequest,
  EndUserAuthorizationResponse,
  MessageProjection,
  PublicExecution,
  StartEndUserExecution,
} from "@linea/protocol/resources"
export type {
  EventEnvelope,
  EventStreamQuery,
  EventType,
} from "@linea/protocol/events"
export type { PaginatedResponse, PaginationQuery } from "@linea/protocol/shared"
