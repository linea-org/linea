import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type Environment } from '@linea/db'
import { ZodError } from 'zod'
import type {
  ReplaceEnvironmentTrustDto,
  ReplaceConnectorAccessPolicyDto,
  UpdateEnvironmentProfileDto,
} from './dto/environment-input.dto'
import { validateProductionEnvironmentTrust } from './dto/environment-input.dto'

@Injectable()
export class EnvironmentsService {
  async get(workspaceId: string, id: string): Promise<Environment> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      id,
    )
    if (!environment) throw new NotFoundException('Environment not found')
    return environment
  }

  async updateProfile(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: UpdateEnvironmentProfileDto,
  ): Promise<Environment> {
    const environment = await repositories.environment.updateEnvironmentProfile(
      db,
      workspaceId,
      id,
      input,
      { userId: actorUserId },
    )
    if (!environment) throw new NotFoundException('Environment not found')
    return environment
  }

  async replaceTrust(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: ReplaceEnvironmentTrustDto,
  ): Promise<Environment> {
    const existing = await this.get(workspaceId, id)
    let trust = input
    if (existing.environment === 'production') {
      try {
        trust = validateProductionEnvironmentTrust(input)
      } catch (error) {
        if (error instanceof ZodError) {
          throw new BadRequestException(error.issues)
        }
        throw error
      }
    }
    const environment =
      await repositories.environment.replaceEnvironmentTrustConfiguration(
        db,
        workspaceId,
        id,
        trust,
        { userId: actorUserId },
      )
    if (!environment) throw new NotFoundException('Environment not found')
    return environment
  }

  async disable(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<Environment> {
    const environment = await repositories.environment.disableEnvironment(
      db,
      workspaceId,
      id,
      { userId: actorUserId },
    )
    if (!environment) throw new NotFoundException('Environment not found')
    return environment
  }

  async replaceConnectorAccessPolicy(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: ReplaceConnectorAccessPolicyDto,
  ): Promise<Environment> {
    const environment =
      await repositories.environment.replaceConnectorAccessPolicy(
        db,
        workspaceId,
        id,
        input,
        { userId: actorUserId },
      )
    if (!environment) throw new NotFoundException('Environment not found')
    return environment
  }
}
