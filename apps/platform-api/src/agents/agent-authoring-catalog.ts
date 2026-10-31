import { registry } from '@linea/ai'
import { connectorOperationRegistry } from '@linea/connectors'

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
