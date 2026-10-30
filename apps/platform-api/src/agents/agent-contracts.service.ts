import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type AgentContractRevision } from '@linea/db'
import type { CreateAgentContractDto } from './dto/create-agent-contract.dto'

@Injectable()
export class AgentContractsService {
  async create(
    workspaceId: string,
    agentId: string,
    input: CreateAgentContractDto,
  ): Promise<AgentContractRevision> {
    const result = await repositories.agentContract.createAgentContractRevision(
      db,
      workspaceId,
      agentId,
      input,
    )
    if (result.outcome === 'not_found') {
      throw new NotFoundException('Agent not found')
    }
    return result.revision
  }

  async list(
    workspaceId: string,
    agentId: string,
  ): Promise<AgentContractRevision[]> {
    const agent = await repositories.agent.getAgentById(
      db,
      workspaceId,
      agentId,
    )
    if (!agent) throw new NotFoundException('Agent not found')
    return repositories.agentContract.listAgentContractRevisions(
      db,
      workspaceId,
      agentId,
    )
  }

  async get(
    workspaceId: string,
    agentId: string,
    id: string,
  ): Promise<AgentContractRevision> {
    const revision = await repositories.agentContract.getAgentContractRevision(
      db,
      workspaceId,
      agentId,
      id,
    )
    if (!revision) throw new NotFoundException('Agent Contract not found')
    return revision
  }
}
