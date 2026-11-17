import { Injectable, Logger } from '@nestjs/common'
import { sendEmail } from '@linealabs/auth/email'
import { noticeEmailHtml } from '@linealabs/auth/emails'
import { db, repositories, type WorkflowTemplate } from '@linealabs/db'

type TemplateRef = Pick<
  WorkflowTemplate,
  'id' | 'name' | 'workspaceId' | 'authorId'
>

type Notice = {
  userId: string
  template: TemplateRef
  type:
    | 'template.hidden'
    | 'template.appeal_upheld'
    | 'template.appeal_rejected'
  severity: 'success' | 'warning'
  title: string
  paragraphs: string[]
}

/**
 * Tells a template's author what moderation did, in the app and by email. Delivery trouble is
 * logged and never undoes the decision it reports.
 */
@Injectable()
export class TemplateModerationNotifier {
  private readonly logger = new Logger(TemplateModerationNotifier.name)

  async hidden(template: TemplateRef, reason: string | null) {
    if (!template.authorId) return
    await this.deliver({
      userId: template.authorId,
      template,
      type: 'template.hidden',
      severity: 'warning',
      title: `“${template.name}” was hidden`,
      paragraphs: [
        reason
          ? `It is hidden from the community: ${reason}`
          : 'It is hidden from the community.',
        'If you think this was a mistake, appeal from Templates, under Yours.',
      ],
    })
  }

  async appealDecided(
    appeal: { appellantId: string | null },
    template: TemplateRef,
    decision: { upheld: boolean; note: string | null; finalAppeal: boolean },
  ) {
    if (!appeal.appellantId) return
    const note = decision.note ? [`Reviewer’s note: ${decision.note}`] : []
    await this.deliver(
      decision.upheld
        ? {
            userId: appeal.appellantId,
            template,
            type: 'template.appeal_upheld',
            severity: 'success',
            title: 'Your appeal was upheld',
            paragraphs: [
              `“${template.name}” is back in the community.`,
              ...note,
            ],
          }
        : {
            userId: appeal.appellantId,
            template,
            type: 'template.appeal_rejected',
            severity: 'warning',
            title: 'Your appeal was rejected',
            paragraphs: [
              `“${template.name}” stays hidden.`,
              ...note,
              decision.finalAppeal
                ? 'That was the last appeal for this template. You can remove it and publish a corrected copy.'
                : 'You can send another appeal if something has changed.',
            ],
          },
    )
  }

  private async deliver(notice: Notice) {
    const { userId, template, title, paragraphs } = notice
    try {
      await repositories.notification.createNotification(db, {
        userId,
        workspaceId: template.workspaceId,
        type: notice.type,
        severity: notice.severity,
        title,
        body: paragraphs.join(' '),
        metadata: { templateId: template.id },
      })
    } catch (error) {
      this.logger.error(
        `Could not notify ${userId} about template ${template.id}`,
        error instanceof Error ? error.stack : String(error),
      )
    }
    try {
      await this.email(notice)
    } catch (error) {
      this.logger.error(
        `Could not email ${userId} about template ${template.id}`,
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  private async email({ userId, template, title, paragraphs }: Notice) {
    const contact = await repositories.user.getEmailContact(db, userId)
    if (!contact?.emailNotifications) return
    const appUrl = process.env.APP_URL
    const workspace = await repositories.organization.getOrganizationById(
      db,
      template.workspaceId,
    )
    const ctaUrl =
      appUrl && workspace
        ? `${appUrl.replace(/\/$/, '')}/w/${workspace.slug}/templates?tab=workspace`
        : undefined
    await sendEmail({
      to: contact.email,
      subject: title,
      html: noticeEmailHtml({
        name: contact.name,
        title,
        preview: paragraphs[0],
        paragraphs,
        ctaLabel: ctaUrl ? 'Open your templates' : undefined,
        ctaUrl,
      }),
      text: paragraphs.join('\n\n'),
    })
  }
}
