import { registry } from '@linealabs/ai'
import { connectorOperationRegistry } from '@linealabs/connectors'

export function agentAuthoringCatalog() {
  return {
    models: Object.keys(registry),
    operations: Object.values(connectorOperationRegistry).map((operation) => ({
      id: operation.id,
      provider: operation.provider,
      classification: operation.classification,
    })),
  }
}
