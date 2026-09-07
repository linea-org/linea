import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories } from '@linea/db'

@Injectable()
export class ConversationAnalysesService {
  async get(
    workspaceId: string,
    workflowId: string,
    conversationId: string,
    findingId: string | undefined,
  ) {
    const messages = await repositories.chatMessage.listChatMessages(
      db,
      workspaceId,
      workflowId,
      conversationId,
    )
    if (messages.length === 0) {
      throw new NotFoundException('Conversation not found')
    }
    const conversation = {
      id: conversationId,
      externalSubjectId:
        messages.find((message) => message.externalSubjectId)
          ?.externalSubjectId ?? null,
      messages: messages.map((message) => ({
        id: message.id,
        executionId: message.executionId,
        role: message.role,
        content: message.content,
        sequence: message.sequence,
        createdAt: message.createdAt,
      })),
    }
    const analysis = findingId
      ? await repositories.conversationAnalysis.getConversationAnalysisForFinding(
          db,
          workspaceId,
          workflowId,
          conversationId,
          findingId,
        )
      : await repositories.conversationAnalysis.getLatestConversationAnalysis(
          db,
          workspaceId,
          workflowId,
          conversationId,
        )
    if (findingId && !analysis) {
      throw new NotFoundException('Conversation finding not found')
    }
    if (!analysis) {
      const enabled =
        await repositories.workspaceSettings.isBehaviourAnalysisEnabled(
          db,
          workspaceId,
        )
      if (!enabled) {
        return {
          status: 'disabled',
          conversation,
          analysis: null,
          findings: [],
          attempt: null,
        }
      }
      const claim =
        await repositories.conversationAnalysis.getConversationAnalysisClaim(
          db,
          workspaceId,
          workflowId,
          conversationId,
        )
      const attempt = claim
        ? {
            attemptCount: claim.attemptCount,
            lastAttemptAt: claim.claimedAt,
          }
        : null
      const claimExpired =
        claim &&
        claim.claimedAt.getTime() <
          Date.now() - repositories.conversationAnalysis.DEFAULT_CLAIM_LEASE_MS
      const status = claimExpired ? 'unavailable' : 'pending'
      return {
        status,
        conversation,
        analysis: null,
        findings: [],
        attempt,
      }
    }
    const findings =
      await repositories.conversationAnalysis.listConversationFindings(
        db,
        workspaceId,
        analysis.id,
      )
    return {
      status:
        analysis.analyzerVersion === 'sampled-out' ? 'sampled_out' : 'complete',
      conversation,
      analysis: {
        id: analysis.id,
        analyzedThroughSequence: analysis.analyzedThroughSequence,
        analyzerVersion: analysis.analyzerVersion,
        model: analysis.model,
        provider: analysis.provider,
        tokensInput: analysis.tokensInput,
        tokensOutput: analysis.tokensOutput,
        costMicros: analysis.costMicros,
        createdAt: analysis.createdAt,
      },
      findings: findings.map((finding) => ({
        id: finding.id,
        axis: finding.axis,
        category: finding.category,
        confidence: finding.confidence,
        evidenceMessageId: finding.evidenceMessageId,
        rationale: finding.rationale,
        createdAt: finding.createdAt,
      })),
    }
  }
}
