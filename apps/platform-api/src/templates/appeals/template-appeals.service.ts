import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { AppealTemplateDto } from '../moderation/dto/moderation.dto'
import { appealTypeDefinition } from './template-appeal-types'

type Viewer = { workspaceId: string; userId: string }

const { MAX_APPEALS_PER_TEMPLATE } = repositories.templateAppeal

@Injectable()
export class TemplateAppealsService {
  /** The author, or an admin or owner of their workspace, asks staff to look again at a hidden template. */
  async submit(viewer: Viewer, templateId: string, input: AppealTemplateDto) {
    const template = await repositories.workflowTemplate.getOwnWorkflowTemplate(
      db,
      viewer.workspaceId,
      templateId,
    )
    if (!template) throw new NotFoundException('Template not found')
    if (template.authorId !== viewer.userId) {
      const role = await repositories.organization.getMemberRole(
        db,
        viewer.workspaceId,
        viewer.userId,
      )
      if (role !== 'admin' && role !== 'owner') {
        throw new ForbiddenException(
          'Only the author or a workspace admin can appeal.',
        )
      }
    }
    if (appealTypeDefinition(input.type).messageRequired && !input.message) {
      throw new UnprocessableEntityException(
        'Add a few words so the reviewer can judge this appeal.',
      )
    }
    const result = await repositories.templateAppeal.createTemplateAppeal(db, {
      templateId,
      workspaceId: viewer.workspaceId,
      appellantId: viewer.userId,
      type: input.type,
      message: input.message || null,
    })
    switch (result.outcome) {
      case 'created':
        return { id: result.appeal.id, status: result.appeal.status }
      case 'not_found':
        throw new NotFoundException('Template not found')
      case 'not_hidden':
        throw new ConflictException('Only a hidden template can be appealed.')
      case 'already_open':
        throw new ConflictException('An appeal is already waiting for review.')
      case 'limit_reached':
        throw new ConflictException(
          `This template has used its ${MAX_APPEALS_PER_TEMPLATE} appeals. Remove it and publish a corrected copy instead.`,
        )
    }
  }
}
