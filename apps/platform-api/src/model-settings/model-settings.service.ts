import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DEFAULT_ANALYSIS_MODEL, registry } from '@linea/ai'
import { db, repositories } from '@linea/db'
import { buildModelCatalog, type CatalogModel } from './model-catalog'
import {
  aiProviderStatuses,
  type AiProviderKeyStatus,
} from '../secrets/secrets.service'
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
  /** Which providers have a key where the assistant runs; status only, never a value. */
  providers: AiProviderKeyStatus[]
}

@Injectable()
export class ModelSettingsService {
  /** The default Application is the oldest one, so creating another never moves where keys are read. */
  async get(
    workspaceId: string,
    applicationId?: string,
  ): Promise<ModelSettings> {
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
      providers: await this.providerStatuses(workspaceId, applicationId),
    }
  }

  private async providerStatuses(workspaceId: string, applicationId?: string) {
    const id =
      applicationId ??
      (await repositories.application.listApplications(db, workspaceId)).at(-1)
        ?.id
    if (!id) return aiProviderStatuses(workspaceId, new Set())
    if (applicationId) {
      const application = await repositories.application.getApplicationById(
        db,
        workspaceId,
        applicationId,
      )
      if (!application) throw new NotFoundException('Application not found')
    }
    const environments = await repositories.environment.listEnvironments(
      db,
      workspaceId,
      id,
    )
    const development = environments.find((item) => item.environment === 'dev')
    const secrets = development
      ? await repositories.secret.listSecrets(db, development.id)
      : []
    return aiProviderStatuses(
      workspaceId,
      new Set(secrets.map((secret) => secret.key)),
    )
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
