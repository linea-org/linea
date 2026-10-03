import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type {
  ExternalSubjectProjection,
  ProvisionExternalSubject,
} from '@linea/protocol/resources'
import type { EnvironmentPrincipal } from '../auth/environment-key.guard'
import { publicError } from '../auth/public-error'

function toProjection(
  value: Awaited<
    ReturnType<
      typeof repositories.externalSubject.getEnvironmentExternalSubject
    >
  >,
): ExternalSubjectProjection {
  if (!value?.subject.issuerSubject) {
    throw new NotFoundException(
      publicError('resource_not_found', 'External Subject not found'),
    )
  }
  return {
    id: value.subject.id,
    issuerSubject: value.subject.issuerSubject,
    status: value.subject.status,
    metadata: value.environment.metadata,
    createdAt: value.subject.createdAt.toISOString(),
    updatedAt: value.environment.updatedAt.toISOString(),
  }
}

@Injectable()
export class ExternalSubjectsService {
  async provision(
    principal: EnvironmentPrincipal,
    input: ProvisionExternalSubject,
  ): Promise<ExternalSubjectProjection> {
    const result = await repositories.externalSubject.provisionExternalSubject(
      db,
      {
        workspaceId: principal.workspaceId,
        environmentId: principal.environmentId,
        issuerSubject: input.issuerSubject,
        metadata: input.metadata,
      },
      principal.keyId,
    )
    if (
      result.outcome === 'environment_not_found' ||
      result.outcome === 'environment_disabled'
    ) {
      throw new NotFoundException(
        publicError('resource_not_found', 'Environment not found'),
      )
    }
    if (result.outcome === 'external_subject_disabled') {
      throw new ConflictException(
        publicError(
          'external_subject_disabled',
          'External Subject is disabled',
        ),
      )
    }
    return toProjection(result.value)
  }

  async disable(
    workspaceId: string,
    externalSubjectId: string,
    actorUserId: string,
  ): Promise<void> {
    const subject = await repositories.externalSubject.disableExternalSubject(
      db,
      workspaceId,
      externalSubjectId,
      actorUserId,
    )
    if (!subject) {
      throw new NotFoundException(
        publicError('resource_not_found', 'External Subject not found'),
      )
    }
  }

  async erase(
    workspaceId: string,
    externalSubjectId: string,
    actorUserId: string,
  ): Promise<void> {
    const subject = await repositories.externalSubject.eraseExternalSubject(
      db,
      workspaceId,
      externalSubjectId,
      actorUserId,
    )
    if (!subject) {
      throw new NotFoundException(
        publicError('resource_not_found', 'External Subject not found'),
      )
    }
  }
}
