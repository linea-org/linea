import { BadRequestException, Injectable } from '@nestjs/common'
import { DEFAULT_ANALYSIS_MODEL, registry } from '@linea/ai'
import { db, repositories } from '@linea/db'
import { buildModelCatalog, type CatalogModel } from './model-catalog'
import type { UpdateModelSettingsDto } from './dto/update-model-settings.dto'

export type ModelSettings = {
  /** Assistant model; null until a member chooses one, so nothing runs on an unpicked model. */
  defaultModel: string | null
  behaviourModel: string | null
  judgeModel: string | null
  stepModel: string | null
  /** What conversation analysis uses while behaviourModel is unset. */
  analysisFallbackModel: string
  models: CatalogModel[]
}

@Injectable()
export class ModelSettingsService {
  async get(workspaceId: string): Promise<ModelSettings> {
    const settings =
      await repositories.workspaceSettings.getOrCreateWorkspaceSettings(
        db,
        workspaceId,
      )
    return {
      defaultModel: settings.defaultModel,
      behaviourModel: settings.behaviourModel,
      judgeModel: settings.judgeModel,
      stepModel: settings.stepModel,
      analysisFallbackModel: DEFAULT_ANALYSIS_MODEL,
      models: buildModelCatalog(),
    }
  }

  async update(
    workspaceId: string,
    input: UpdateModelSettingsDto,
  ): Promise<ModelSettings> {
    for (const model of Object.values(input)) {
      if (typeof model === 'string' && !(model in registry)) {
        throw new BadRequestException(`Unknown model: ${model}`)
      }
    }
    await repositories.workspaceSettings.updateWorkspaceSettings(
      db,
      workspaceId,
      input,
    )
    return this.get(workspaceId)
  }
}
