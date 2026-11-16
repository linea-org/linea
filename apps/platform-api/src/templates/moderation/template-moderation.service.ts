import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import { TemplateModerationNotifier } from './template-moderation-notifier'
import type {
  ListAppealsDto,
  ListModerationTemplatesDto,
  ListReportsDto,
} from './dto/moderation.dto'

const PAGE_SIZE = 20

/** What company staff do to shared templates. Every decision is written to the audit trail by the repository. */
@Injectable()
export class TemplateModerationService {
  constructor(private readonly notifier: TemplateModerationNotifier) {}
  async listReports(query: ListReportsDto) {
    const { items, total } =
      await repositories.templateModeration.listTemplateReports(db, {
        status: query.status,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
    return { items, total, pageSize: PAGE_SIZE }
  }

  async listTemplates(query: ListModerationTemplatesDto) {
    const { items, total } =
      await repositories.templateModeration.listTemplatesForModeration(db, {
        status: query.status ?? null,
        query: query.q,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
    return {
      // A listing names what to review; the graph itself comes with the detail.
      items: items.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        workspaceId: template.workspaceId,
        workspaceName: template.workspaceName,
        moderationStatus: template.moderationStatus,
        moderationNote: template.moderationNote,
        moderatedAt: template.moderatedAt,
        starCount: template.starCount,
        useCount: template.useCount,
        openReportCount: template.openReportCount,
        createdAt: template.createdAt,
      })),
      total,
      pageSize: PAGE_SIZE,
    }
  }

  async listAppeals(query: ListAppealsDto) {
    const { items, total } =
      await repositories.templateAppeal.listTemplateAppeals(db, {
        status: query.status,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
    return { items, total, pageSize: PAGE_SIZE }
  }

  /** Upholding restores the template; rejecting keeps it hidden. */
  async decideAppeal(
    actorId: string,
    appealId: string,
    decision: 'upheld' | 'rejected',
    note: string | undefined,
  ) {
    const appeal = await repositories.templateAppeal.decideTemplateAppeal(db, {
      appealId,
      actorId,
      decision,
      note: note || null,
    })
    if (!appeal) throw new NotFoundException('Open appeal not found')
    const template = await repositories.workflowTemplate.getOwnWorkflowTemplate(
      db,
      appeal.workspaceId,
      appeal.templateId,
    )
    if (template) {
      const states = await repositories.templateAppeal.getAppealStates(db, [
        template.id,
      ])
      await this.notifier.appealDecided(appeal, template, {
        upheld: decision === 'upheld',
        note: note || null,
        finalAppeal:
          (states.get(template.id)?.total ?? 0) >=
          repositories.templateAppeal.MAX_APPEALS_PER_TEMPLATE,
      })
    }
    return { status: appeal.status }
  }

  async detail(id: string) {
    const detail =
      await repositories.templateModeration.getTemplateForModeration(db, id)
    if (!detail) throw new NotFoundException('Template not found')
    return detail
  }

  async setHidden(
    actorId: string,
    id: string,
    hidden: boolean,
    note: string | undefined,
  ) {
    const template = await repositories.templateModeration.setTemplateHidden(
      db,
      { templateId: id, actorId, hidden, note: note || null },
    )
    if (!template) throw new NotFoundException('Template not found')
    if (hidden) await this.notifier.hidden(template, note || null)
    return { moderationStatus: template.moderationStatus }
  }

  async remove(actorId: string, id: string, note: string | undefined) {
    const template =
      await repositories.templateModeration.removeTemplateAsModerator(db, {
        templateId: id,
        actorId,
        note: note || null,
      })
    if (!template) throw new NotFoundException('Template not found')
  }

  async dismissReport(
    actorId: string,
    reportId: string,
    note: string | undefined,
  ) {
    const report = await repositories.templateModeration.dismissTemplateReport(
      db,
      { reportId, actorId, note: note || null },
    )
    if (!report) throw new NotFoundException('Open report not found')
  }
}
