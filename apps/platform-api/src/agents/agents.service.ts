import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type {
  CreateAgentDto,
  CreateAgentVersionDto,
  UpdateAgentDto,
} from './dto/agent-input.dto'

@Injectable()
export class AgentsService {
  async create(workspaceId: string, input: CreateAgentDto) {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      input.applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    const agent = await repositories.agent.createAgent(db, {
      workspaceId,
      ...input,
    })
    if (!agent)
      throw new ConflictException(
        'Agent slug already exists in this Application',
      )
    return agent
  }
  async list(workspaceId: string, applicationId: string) {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    return repositories.agent.listAgents(db, workspaceId, applicationId)
  }
  async get(workspaceId: string, id: string) {
    const agent = await repositories.agent.getAgentById(db, workspaceId, id)
    if (!agent) throw new NotFoundException('Agent not found')
    return agent
  }
  async update(workspaceId: string, id: string, input: UpdateAgentDto) {
    let archivedAt: Date | null | undefined
    if (input.archived !== undefined)
      archivedAt = input.archived ? new Date() : null
    const agent = await repositories.agent.updateAgent(db, workspaceId, id, {
      name: input.name,
      description: input.description,
      archivedAt,
    })
    if (!agent) throw new NotFoundException('Agent not found')
    return agent
  }
  async createVersion(
    workspaceId: string,
    agentId: string,
    input: CreateAgentVersionDto,
  ) {
    const result = await repositories.agent.createAgentVersion(
      db,
      workspaceId,
      agentId,
      input,
    )
    if (result.outcome === 'agent_not_found')
      throw new NotFoundException('Agent not found')
    if (result.outcome === 'contract_revision_not_found')
      throw new NotFoundException('Agent Contract not found')
    return result.version
  }
  async listVersions(workspaceId: string, agentId: string) {
    await this.get(workspaceId, agentId)
    return repositories.agent.listAgentVersions(db, workspaceId, agentId)
  }
  async getVersion(workspaceId: string, agentId: string, versionId: string) {
    const version = await repositories.agent.getAgentVersionById(
      db,
      workspaceId,
      agentId,
      versionId,
    )
    if (!version) throw new NotFoundException('Agent version not found')
    return version
  }
  async publishVersion(
    workspaceId: string,
    agentId: string,
    versionId: string,
  ) {
    const version = await repositories.agent.publishAgentVersion(
      db,
      workspaceId,
      agentId,
      versionId,
    )
    if (!version) throw new NotFoundException('Active Agent version not found')
    return version
  }
}
