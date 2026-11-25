import { Injectable } from '@nestjs/common'
import {
  ModelKeyMissingError,
  PlatformKeyBudgetError,
  registry,
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  type CompletionRequest,
  type CompletionResult,
} from '@linealabs/ai'
import { db, repositories } from '@linealabs/db'
import {
  AssistantModelUnavailableError,
  describeProviderFailure,
  isRefusedToolCall,
  providerStatus,
} from './assistant-model-error'
import { buildModelCatalog } from '../model-settings/model-catalog'

/** Runs on the model the workspace chose, with the Environment's own key. */
@Injectable()
export class AssistantModel {
  async complete(
    workspaceId: string,
    environmentId: string,
    request: Omit<CompletionRequest, 'model'>,
    modelOverride?: string,
  ): Promise<CompletionResult & { model: string }> {
    const { defaultModel } =
      await repositories.workspaceSettings.getOrCreateWorkspaceSettings(
        db,
        workspaceId,
      )
    const model = modelOverride ?? defaultModel
    if (!model) {
      throw new AssistantModelUnavailableError(
        'Choose a model in Settings → Models to start using the assistant.',
      )
    }
    if (!(model in registry)) {
      throw new AssistantModelUnavailableError(`Unknown model: ${model}`)
    }
    try {
      const { apiKey, source } = await resolveApiKey(db, {
        workspaceId,
        environmentId,
        keyName: resolveKeyName(model),
      })
      const provider = resolveProvider(model)
      const ask = () => provider.complete(apiKey, { ...request, model })
      const result = await ask().catch((error: unknown) => {
        if (isRefusedToolCall(error)) return ask()
        throw error
      })
      if (source === 'platform') {
        await repositories.assistantUsage.recordAssistantUsage(
          db,
          workspaceId,
          result.tokensInput + result.tokensOutput,
        )
      }
      return { ...result, model }
    } catch (error) {
      if (error instanceof PlatformKeyBudgetError) {
        throw new AssistantModelUnavailableError(error.message)
      }
      const entry = buildModelCatalog().find((item) => item.value === model)
      if (error instanceof ModelKeyMissingError) {
        throw new AssistantModelUnavailableError(
          `Add your ${entry?.providerLabel ?? 'model provider'} API key in Settings → Models to use ${entry?.label ?? model}.`,
        )
      }
      const status = providerStatus(error)
      const advice =
        status === null
          ? null
          : describeProviderFailure(
              status,
              entry?.providerLabel ?? 'The provider',
            )
      if (advice) throw new AssistantModelUnavailableError(advice)
      throw error
    }
  }
}
