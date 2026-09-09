import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type Application } from '@linea/db'
import { ZodError } from 'zod'
import type {
  CreateApplicationDto,
  ReplaceApplicationTrustDto,
  UpdateApplicationProfileDto,
} from './dto/application-input.dto'
import { validateProductionApplicationTrust } from './dto/application-input.dto'

@Injectable()
export class ApplicationsService {
  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateApplicationDto,
  ): Promise<Application> {
    return repositories.application.createApplication(
      db,
      {
        workspaceId,
        environment: input.environment,
        displayName: input.displayName,
        logoUrl: input.logoUrl,
        contentRetentionDays: input.contentRetentionDays,
        ...input.trust,
      },
      { userId: actorUserId },
    )
  }

  list(workspaceId: string): Promise<Application[]> {
    return repositories.application.listApplications(db, workspaceId)
  }

  async get(workspaceId: string, id: string): Promise<Application> {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      id,
    )
    if (!application) throw new NotFoundException('Application not found')
    return application
  }

  async updateProfile(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: UpdateApplicationProfileDto,
  ): Promise<Application> {
    const application = await repositories.application.updateApplicationProfile(
      db,
      workspaceId,
      id,
      input,
      { userId: actorUserId },
    )
    if (!application) throw new NotFoundException('Application not found')
    return application
  }

  async replaceTrust(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: ReplaceApplicationTrustDto,
  ): Promise<Application> {
    const existing = await this.get(workspaceId, id)
    let trust = input
    if (existing.environment === 'production') {
      try {
        trust = validateProductionApplicationTrust(input)
      } catch (error) {
        if (error instanceof ZodError) {
          throw new BadRequestException(error.issues)
        }
        throw error
      }
    }
    const application =
      await repositories.application.replaceApplicationTrustConfiguration(
        db,
        workspaceId,
        id,
        trust,
        { userId: actorUserId },
      )
    if (!application) throw new NotFoundException('Application not found')
    return application
  }

  async disable(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<Application> {
    const application = await repositories.application.disableApplication(
      db,
      workspaceId,
      id,
      { userId: actorUserId },
    )
    if (!application) throw new NotFoundException('Application not found')
    return application
  }
}
