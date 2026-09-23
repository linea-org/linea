export { ConnectorGateway, ConnectorGatewayError } from "./connector-gateway.js"
export { readBoundedJsonResponse } from "./bounded-response.js"
export {
  ACTION_INTENT_DIGEST_VERSION,
  canonicalizeActionIntent,
  digestActionIntent,
  type IJsonValue,
} from "./action-intent-canonicalization.js"
export {
  registeredReadOperation,
  type ConnectorOperationRegistry,
  type ConnectorReadCredential,
  type ConnectorReadOperation,
} from "./connector-read-operation.js"
export {
  registeredSideEffectOperation,
  type ActionIntentEnvelope,
  type ConnectorProviderError,
  type ConnectorSideEffectOperation,
  type NormalizedSideEffect,
} from "./connector-side-effect-operation.js"
export { deterministicReadOperation } from "./deterministic-read.operation.js"
export { deterministicSideEffectOperation } from "./deterministic-side-effect.operation.js"
export {
  googleCalendarCreateEventOperation,
  googleCalendarListEventsOperation,
  googleCalendarUpdateEventOperation,
} from "./google-calendar.operations.js"
export {
  googleGmailListMessagesOperation,
  googleGmailSendMessageOperation,
} from "./google-gmail.operations.js"
export {
  GOOGLE_ACTION_SCOPES,
  GOOGLE_IDENTITY_SCOPES,
  googleAuthorizationScopes,
  type GoogleActionFamily,
} from "./google-scopes.js"
export { githubCreateIssueOperation } from "./github-create-issue.operation.js"
export { githubCreatePullRequestOperation } from "./github-create-pull-request.operation.js"
export { githubListIssuesOperation } from "./github-list-issues.operation.js"
export { githubListRepositoriesOperation } from "./github-list-repositories.operation.js"
export { escapeSafeDisplayText, validateSafeDisplay } from "./safe-display.js"
import { githubCreateIssueOperation } from "./github-create-issue.operation.js"
import { githubCreatePullRequestOperation } from "./github-create-pull-request.operation.js"
import { githubListIssuesOperation } from "./github-list-issues.operation.js"
import { githubListRepositoriesOperation } from "./github-list-repositories.operation.js"
import { deterministicReadOperation } from "./deterministic-read.operation.js"
import { deterministicSideEffectOperation } from "./deterministic-side-effect.operation.js"
import {
  googleCalendarCreateEventOperation,
  googleCalendarListEventsOperation,
  googleCalendarUpdateEventOperation,
} from "./google-calendar.operations.js"
import {
  googleGmailListMessagesOperation,
  googleGmailSendMessageOperation,
} from "./google-gmail.operations.js"

export const connectorOperationRegistry = Object.freeze({
  [deterministicReadOperation.id]: deterministicReadOperation,
  [deterministicSideEffectOperation.id]: deterministicSideEffectOperation,
  [googleGmailListMessagesOperation.id]: googleGmailListMessagesOperation,
  [googleGmailSendMessageOperation.id]: googleGmailSendMessageOperation,
  [googleCalendarListEventsOperation.id]: googleCalendarListEventsOperation,
  [googleCalendarCreateEventOperation.id]: googleCalendarCreateEventOperation,
  [googleCalendarUpdateEventOperation.id]: googleCalendarUpdateEventOperation,
  [githubListRepositoriesOperation.id]: githubListRepositoriesOperation,
  [githubListIssuesOperation.id]: githubListIssuesOperation,
  [githubCreateIssueOperation.id]: githubCreateIssueOperation,
  [githubCreatePullRequestOperation.id]: githubCreatePullRequestOperation,
})
