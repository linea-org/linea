export { ConnectorGateway, ConnectorGatewayError } from "./connector-gateway.js"
export {
  registeredReadOperation,
  type ConnectorOperationRegistry,
  type ConnectorReadCredential,
  type ConnectorReadOperation,
} from "./connector-read-operation.js"
export { deterministicReadOperation } from "./deterministic-read.operation.js"

import { deterministicReadOperation } from "./deterministic-read.operation.js"

export const connectorOperationRegistry = Object.freeze({
  [deterministicReadOperation.id]: deterministicReadOperation,
})
