import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type Signal } from '@linea/db'

@Injectable()
export class SignalsService {
  list(workspaceId: string, options: { workflowId?: string } = {}) {
    return repositories.signal.listSignals(db, workspaceId, options)
  }

  async get(workspaceId: string, id: string) {
    const detail = await repositories.signal.getSignalDetail(
      db,
      workspaceId,
      id,
    )
    if (!detail) {
      throw new NotFoundException('Signal not found')
    }
    return detail
  }

  async resolve(workspaceId: string, id: string): Promise<Signal> {
    const signal = await repositories.signal.resolveSignal(db, workspaceId, id)
    if (!signal) {
      throw new NotFoundException('Signal not found')
    }
    return signal
  }
}
