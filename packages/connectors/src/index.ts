export { ConnectorGateway, ConnectorGatewayError } from "./connector-gateway.js"
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
export { escapeSafeDisplayText, validateSafeDisplay } from "./safe-display.js"
import { deterministicReadOperation } from "./deterministic-read.operation.js"
import { deterministicSideEffectOperation } from "./deterministic-side-effect.operation.js"

export const connectorOperationRegistry = Object.freeze({
  [deterministicReadOperation.id]: deterministicReadOperation,
  [deterministicSideEffectOperation.id]: deterministicSideEffectOperation,
})
