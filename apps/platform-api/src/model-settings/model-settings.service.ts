import { BadRequestException, Injectable } from '@nestjs/common'
import { registry } from '@linea/ai'
import { db, repositories } from '@linea/db'
import { buildModelCatalog, type CatalogModel } from './model-catalog'
import type { UpdateModelSettingsDto } from './dto/update-model-settings.dto'

export type ModelSettings = {
  /** Null until a member chooses one; nothing runs on a model the workspace did not pick. */
  defaultModel: string | null
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
    return { defaultModel: settings.defaultModel, models: buildModelCatalog() }
  }

  async update(
    workspaceId: string,
    input: UpdateModelSettingsDto,
  ): Promise<ModelSettings> {
    if (input.defaultModel !== null && !(input.defaultModel in registry)) {
      throw new BadRequestException(`Unknown model: ${input.defaultModel}`)
    }
    await repositories.workspaceSettings.updateWorkspaceSettings(
      db,
      workspaceId,
      {
        defaultModel: input.defaultModel,
      },
    )
    return this.get(workspaceId)
  }
}
