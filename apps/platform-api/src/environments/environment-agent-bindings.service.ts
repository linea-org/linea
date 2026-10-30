import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type EnvironmentAgentBinding } from '@linea/db'
import type { PutAgentBindingDto } from './dto/put-agent-binding.dto'

@Injectable()
export class EnvironmentAgentBindingsService {
  async put(
    workspaceId: string,
    environmentId: string,
    agentId: string,
    input: PutAgentBindingDto,
  ): Promise<EnvironmentAgentBinding> {
    const result =
      await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
        db,
        workspaceId,
        environmentId,
        agentId,
        input,
      )
    if (result.outcome === 'environment_not_found') {
      throw new NotFoundException('Environment not found')
    }
    if (result.outcome === 'agent_not_found') {
      throw new NotFoundException('Agent not found')
    }
    if (result.outcome === 'contract_revision_not_found') {
      throw new NotFoundException('Agent Contract not found')
    }
    if (result.outcome === 'version_not_found')
      throw new NotFoundException(
        'Published Agent version not found for this contract',
      )
    return result.binding
  }

  async list(
    workspaceId: string,
    environmentId: string,
  ): Promise<EnvironmentAgentBinding[]> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
    return repositories.environmentAgentBinding.listEnvironmentAgentBindings(
      db,
      workspaceId,
      environmentId,
    )
  }
}
