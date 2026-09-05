import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type Signal } from '@linea/db'

@Injectable()
export class SignalsService {
  list(workspaceId: string, options: { workflowId?: string } = {}) {
    return repositories.signal.listSignals(db, workspaceId, options)
  }

  trend(workspaceId: string, options: { workflowId?: string } = {}) {
    return repositories.signal.getSignalsTrend(db, workspaceId, options)
  }

  async get(
    workspaceId: string,
    id: string,
    options: { environment: 'production' | 'dev' | 'draft' },
  ) {
    const detail = await repositories.signal.getSignalDetail(
      db,
      workspaceId,
      id,
    )
    if (!detail) {
      throw new NotFoundException('Signal not found')
    }
    const dimensionData =
      await repositories.signalDimensions.getSignalDimensions(
        db,
        detail,
        options.environment,
      )
    return {
      ...detail,
      ...dimensionData,
      dimensionScope: {
        environment: options.environment,
        windowDays: repositories.signalDimensions.SIGNAL_DIMENSIONS_WINDOW_DAYS,
      },
    }
  }

  async resolve(workspaceId: string, id: string): Promise<Signal> {
    const signal = await repositories.signal.resolveSignal(db, workspaceId, id)
    if (!signal) {
      throw new NotFoundException('Signal not found')
    }
    return signal
  }
}
