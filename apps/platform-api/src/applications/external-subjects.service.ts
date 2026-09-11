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
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { publicError } from '../auth/public-error'

function toProjection(
  value: Awaited<
    ReturnType<
      typeof repositories.externalSubject.getApplicationExternalSubject
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
    metadata: value.application.metadata,
    createdAt: value.subject.createdAt.toISOString(),
    updatedAt: value.application.updatedAt.toISOString(),
  }
}

@Injectable()
export class ExternalSubjectsService {
  async provision(
    principal: ApplicationPrincipal,
    input: ProvisionExternalSubject,
  ): Promise<ExternalSubjectProjection> {
    const result = await repositories.externalSubject.provisionExternalSubject(
      db,
      {
        workspaceId: principal.workspaceId,
        applicationId: principal.applicationId,
        issuerSubject: input.issuerSubject,
        metadata: input.metadata,
      },
      principal.keyId,
    )
    if (
      result.outcome === 'application_not_found' ||
      result.outcome === 'application_disabled'
    ) {
      throw new NotFoundException(
        publicError('resource_not_found', 'Application not found'),
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
