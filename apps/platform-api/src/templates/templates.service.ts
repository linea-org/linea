import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { db, repositories, type WorkflowTemplate } from '@linea/db'
import {
  validateGraphStructure,
  workflowGraphSchema,
  WorkflowGraphError,
} from '@linea/runtime'
import type { ListTemplatesDto, PublishTemplateDto } from './dto/template.dto'
import type { ReportTemplateDto } from './moderation/dto/moderation.dto'
import { findLiteralCredentials } from './template-credentials'

const PAGE_SIZE = 9
const MAX_GRAPH_CHARS = 100_000

type Viewer = { workspaceId: string; userId: string }

type AppealState =
  Awaited<
    ReturnType<typeof repositories.templateAppeal.getAppealStates>
  > extends Map<string, infer State>
    ? State
    : never

function toItem(
  template: WorkflowTemplate & { workspaceName: string; starred: boolean },
  viewer: Viewer,
  isAdmin: boolean,
  appeal?: AppealState,
) {
  const mine = template.workspaceId === viewer.workspaceId
  const canRemove = mine && (template.authorId === viewer.userId || isAdmin)
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    graph: template.graph,
    starCount: template.starCount,
    useCount: template.useCount,
    starred: template.starred,
    mine,
    moderation: {
      status: template.moderationStatus,
      // Why it was hidden is for its author, not for browsers.
      note: mine ? template.moderationNote : null,
    },
    canRemove,
    // Whoever may remove it may appeal its hiding, until an appeal is waiting or they have all been used.
    canAppeal:
      canRemove &&
      template.moderationStatus === 'hidden' &&
      appeal?.latest.status !== 'open' &&
      (appeal?.total ?? 0) <
        repositories.templateAppeal.MAX_APPEALS_PER_TEMPLATE,
    appeal: appeal
      ? {
          type: appeal.latest.type,
          status: appeal.latest.status,
          decisionNote: appeal.latest.decisionNote,
          createdAt: appeal.latest.createdAt,
        }
      : null,
    workspaceName: template.workspaceName,
    createdAt: template.createdAt,
  }
}

@Injectable()
export class TemplatesService {
  async list(viewer: Viewer, query: ListTemplatesDto) {
    const isAdmin = await this.isAdmin(viewer)
    const { items, total } =
      await repositories.workflowTemplate.listWorkflowTemplates(db, viewer, {
        scope: query.scope,
        query: query.q,
        sort: query.sort,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
    const appeals = await repositories.templateAppeal.getAppealStates(
      db,
      items
        .filter((item) => item.workspaceId === viewer.workspaceId)
        .map((item) => item.id),
    )
    return {
      items: items.map((item) =>
        toItem(item, viewer, isAdmin, appeals.get(item.id)),
      ),
      total,
      pageSize: PAGE_SIZE,
    }
  }

  /** Copies the workflow's current graph, so what is shared is what the author sees now, and later edits do not leak out. */
  async publish(viewer: Viewer, input: PublishTemplateDto) {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      viewer.workspaceId,
      input.workflowId,
    )
    if (!workflow) throw new NotFoundException('Workflow not found')
    const raw =
      workflow.draftGraph ??
      (await repositories.workflow.getPublishedVersion(db, workflow.id))?.graph
    if (!raw) {
      throw new UnprocessableEntityException('This workflow has no graph yet.')
    }
    const parsed = workflowGraphSchema.safeParse(raw)
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'Finish the workflow before publishing it: its graph is not valid yet.',
      )
    }
    try {
      validateGraphStructure(parsed.data)
    } catch (error) {
      if (error instanceof WorkflowGraphError) {
        throw new UnprocessableEntityException(error.message)
      }
      throw error
    }
    if (JSON.stringify(parsed.data).length > MAX_GRAPH_CHARS) {
      throw new UnprocessableEntityException('This workflow is too large.')
    }
    const credentials = findLiteralCredentials(parsed.data)
    if (credentials.length > 0) {
      throw new UnprocessableEntityException(
        `Remove the credentials before publishing: ${credentials.join(', ')}.`,
      )
    }
    const template = await repositories.workflowTemplate.createWorkflowTemplate(
      db,
      {
        workspaceId: viewer.workspaceId,
        authorId: viewer.userId,
        name: input.name,
        description: input.description || null,
        graph: parsed.data,
        visibility: input.visibility,
      },
    )
    const item = await repositories.workflowTemplate.getListedWorkflowTemplate(
      db,
      viewer,
      template.id,
    )
    if (!item) throw new Error('A template just published is not visible')
    return toItem(item, viewer, await this.isAdmin(viewer))
  }

  async setStar(viewer: Viewer, id: string, starred: boolean) {
    const result = await repositories.workflowTemplate.setWorkflowTemplateStar(
      db,
      viewer,
      id,
      starred,
    )
    if (!result) throw new NotFoundException('Template not found')
    return result
  }

  /** Counts one use and hands back the graph to build the new workflow from. */
  async use(workspaceId: string, id: string) {
    const template =
      await repositories.workflowTemplate.recordWorkflowTemplateUse(
        db,
        workspaceId,
        id,
      )
    if (!template) throw new NotFoundException('Template not found')
    return { name: template.name, graph: template.graph }
  }

  /** Reporting your own template is refused; reporting one twice changes nothing. Enough reports hide it for review. */
  async report(viewer: Viewer, id: string, input: ReportTemplateDto) {
    const template =
      await repositories.workflowTemplate.getVisibleWorkflowTemplate(
        db,
        viewer.workspaceId,
        id,
      )
    if (!template) throw new NotFoundException('Template not found')
    if (template.workspaceId === viewer.workspaceId) {
      throw new ForbiddenException('You cannot report your own template.')
    }
    await repositories.templateModeration.createTemplateReport(db, {
      templateId: id,
      reporterId: viewer.userId,
      reporterWorkspaceId: viewer.workspaceId,
      reason: input.reason,
      details: input.details || null,
    })
  }

  private async isAdmin(viewer: Viewer) {
    const role = await repositories.organization.getMemberRole(
      db,
      viewer.workspaceId,
      viewer.userId,
    )
    return role === 'admin' || role === 'owner'
  }

  /** The author, or an admin or owner of the authoring workspace, so a template whose author has left can still be taken down. */
  async remove(viewer: Viewer, id: string) {
    const template = await repositories.workflowTemplate.getOwnWorkflowTemplate(
      db,
      viewer.workspaceId,
      id,
    )
    if (!template) throw new NotFoundException('Template not found')
    if (template.authorId !== viewer.userId && !(await this.isAdmin(viewer))) {
      throw new ForbiddenException(
        'Only the author or a workspace admin can remove a template.',
      )
    }
    await repositories.workflowTemplate.deleteWorkflowTemplate(
      db,
      viewer.workspaceId,
      id,
    )
  }
}
