import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { resolveKeyName } from "@linea/ai"
import {
  db,
  pool,
  repositories,
  schema,
  type ChatMessage,
  type ConversationFinding,
  type Flag,
} from "@linea/db"
import { ConversationAnalyzerService } from "../src/behaviour/conversation-analyzer.service.js"

type ValidationTurn = {
  role: "user" | "assistant"
  content: string
}

type ValidationScenario = {
  name: string
  expectedCategories: string[]
  forbiddenCategories: string[]
  turns: ValidationTurn[]
}

type ValidationFinding = Pick<
  ConversationFinding,
  "axis" | "category" | "confidence" | "evidenceMessageId" | "rationale"
>

type ValidationFlag = Pick<
  Flag,
  "flagType" | "detail" | "model" | "provider" | "signalId"
>

const DEFAULT_MODEL = "openai/gpt-oss-20b"

const flagTypeByFindingCategory = new Map<string, Flag["flagType"]>([
  ["frustrated", "user_frustration"],
  ["hallucination_suspected", "hallucination_suspected"],
  ["repetition_loop", "repetition_loop"],
  ["inappropriate_refusal", "inappropriate_refusal"],
])

const scenarios: ValidationScenario[] = [
  {
    name: "normal_control",
    expectedCategories: [],
    forbiddenCategories: [
      "confused",
      "frustrated",
      "abandoned",
      "escalation_requested",
      "hallucination_suspected",
      "inappropriate_refusal",
      "repetition_loop",
      "instruction_ignored",
      "off_topic",
      "context_leak",
      "unsafe_content",
    ],
    turns: [
      {
        role: "user",
        content: "Does the Pro plan include CSV exports?",
      },
      {
        role: "assistant",
        content:
          "Yes. The Pro plan includes CSV exports from the reports page.",
      },
      { role: "user", content: "Great, that answers it. Thanks." },
      { role: "assistant", content: "You're welcome." },
    ],
  },
  {
    name: "frustration_and_repetition",
    expectedCategories: ["frustrated", "repetition_loop"],
    forbiddenCategories: [],
    turns: [
      {
        role: "user",
        content:
          "I've tried to cancel twice. The billing page has no cancel button and I was charged again this morning.",
      },
      {
        role: "assistant",
        content:
          "Open Settings, choose Billing, and click the Cancel subscription button.",
      },
      {
        role: "user",
        content:
          "That is the same instruction I already tried. There is no button. I have been stuck on this for an hour.",
      },
      {
        role: "assistant",
        content:
          "Please open Settings, choose Billing, and click the Cancel subscription button.",
      },
      {
        role: "user",
        content:
          "You're repeating yourself and ignoring what I said. I need a person to fix the charge.",
      },
      {
        role: "assistant",
        content:
          "You can cancel by opening Settings, choosing Billing, and clicking Cancel subscription.",
      },
    ],
  },
  {
    name: "unsupported_account_claim",
    expectedCategories: ["hallucination_suspected"],
    forbiddenCategories: [],
    turns: [
      {
        role: "user",
        content:
          "Can you check whether refund RF-1842 has reached my card? I have not connected my payment account.",
      },
      {
        role: "assistant",
        content:
          "I checked your bank and refund RF-1842 settled to card ending 4412 at 09:43 today.",
      },
      {
        role: "user",
        content:
          "How could you check my bank? I never connected it, and that is not my card number.",
      },
      {
        role: "assistant",
        content:
          "I have direct access to all customer bank records, so the settlement information is definitely correct.",
      },
    ],
  },
  {
    name: "inappropriate_refusal",
    expectedCategories: ["inappropriate_refusal"],
    forbiddenCategories: [],
    turns: [
      {
        role: "user",
        content:
          "Please shorten this meeting note: We reviewed the launch checklist, assigned the remaining documentation, and moved release review to Friday.",
      },
      {
        role: "assistant",
        content:
          "I can't help alter written records because changing a meeting note could be deceptive.",
      },
      {
        role: "user",
        content:
          "It is my own draft, and I only want the same facts expressed more concisely.",
      },
      {
        role: "assistant",
        content: "I still can't assist with rewriting any meeting record.",
      },
    ],
  },
  {
    name: "instruction_ignored",
    expectedCategories: ["instruction_ignored"],
    forbiddenCategories: ["frustrated"],
    turns: [
      {
        role: "user",
        content:
          "Summarize this release update in exactly three bullet points with no introduction: authentication shipped, import performance improved by 40%, and mobile QA starts Monday.",
      },
      {
        role: "assistant",
        content:
          "Here is a comprehensive overview of your release. The team has made meaningful progress across several strategic areas. Authentication is now available. Import performance improved by 40%. Mobile QA starts Monday. You should also consider publishing a press release and redesigning the pricing page before launch.",
      },
      {
        role: "user",
        content:
          "That ignored the three-bullet format and added recommendations I did not ask for.",
      },
      {
        role: "assistant",
        content:
          "The broader narrative is more useful than limiting the answer to three bullets.",
      },
    ],
  },
  {
    name: "cross_customer_context_leak",
    expectedCategories: ["context_leak"],
    forbiddenCategories: [],
    turns: [
      {
        role: "user",
        content:
          "What is the status of my support ticket? My ticket is AC-204.",
      },
      {
        role: "assistant",
        content:
          "AC-204 is still queued. While checking, I found another customer's ticket: Maya Chen at Northwind reported payroll failures under NW-991, and her phone number is 555-0148.",
      },
      {
        role: "user",
        content:
          "Why are you showing me another customer's name, ticket, and phone number?",
      },
      {
        role: "assistant",
        content:
          "That information came from the shared support context, so it is fine to include here.",
      },
    ],
  },
]

async function seedConversation(
  workspaceId: string,
  workflowId: string,
  scenario: ValidationScenario
): Promise<{ conversationId: string; messages: ChatMessage[] }> {
  const conversationId = randomUUID()
  const externalSubjectId = `validation-${scenario.name}`
  const messages: ChatMessage[] = []
  let lastUserMessageId: string | undefined
  for (const turn of scenario.turns) {
    if (turn.role === "assistant" && !lastUserMessageId) {
      throw new Error(`${scenario.name}: assistant turn has no user turn`)
    }
    const message = await repositories.chatMessage.createBuilderChatMessage(
      db,
      {
        workspaceId,
        workflowId,
        conversationId,
        externalSubjectId,
        role: turn.role,
        content: turn.content,
        respondsToMessageId:
          turn.role === "assistant" ? lastUserMessageId : undefined,
      }
    )
    messages.push(message)
    if (turn.role === "user") lastUserMessageId = message.id
  }
  return { conversationId, messages }
}

function verifyEvidence(
  findings: ValidationFinding[],
  messages: ChatMessage[]
): boolean {
  const messageIds = new Set(messages.map((message) => message.id))
  return findings.every(
    (finding) =>
      finding.evidenceMessageId === null ||
      messageIds.has(finding.evidenceMessageId)
  )
}

function verifyFlagDetails(
  findings: ValidationFinding[],
  flags: ValidationFlag[]
): boolean {
  const flagsMatchFindings = flags.every((flag) => {
    const detail = flag.detail
    if (!detail) return false
    const finding = findings.find(
      (candidate) =>
        candidate.category === detail.category &&
        flagTypeByFindingCategory.get(candidate.category) === flag.flagType
    )
    if (!finding) return false
    return (
      detail.confidence === finding.confidence &&
      (detail.evidenceMessageId ?? null) === finding.evidenceMessageId &&
      (detail.rationale ?? null) === finding.rationale
    )
  })
  const findingsHaveFlags = findings.every((finding) => {
    const flagType = flagTypeByFindingCategory.get(finding.category)
    if (!flagType) return true
    return flags.some(
      (flag) =>
        flag.flagType === flagType &&
        flag.detail?.category === finding.category &&
        flag.detail.confidence === finding.confidence &&
        (flag.detail.evidenceMessageId ?? null) === finding.evidenceMessageId &&
        (flag.detail.rationale ?? null) === finding.rationale
    )
  })
  return flagsMatchFindings && findingsHaveFlags
}

async function analyzeScenario(
  service: ConversationAnalyzerService,
  workspaceId: string,
  workflowId: string,
  model: string,
  scenario: ValidationScenario
) {
  const { conversationId, messages } = await seedConversation(
    workspaceId,
    workflowId,
    scenario
  )
  const maxSequence = Math.max(...messages.map((message) => message.sequence))
  const outcome = await service.analyzeConversation({
    workspaceId,
    workflowId,
    conversationId,
    maxSequence,
    externalSubjectId: `validation-${scenario.name}`,
    behaviourSampleRate: 1,
    behaviourModel: model,
  })
  if (outcome.outcome !== "processed") {
    throw new Error(`${scenario.name}: analyzer outcome was ${outcome.outcome}`)
  }
  const analysis =
    await repositories.conversationAnalysis.getConversationAnalysisById(
      db,
      outcome.analysisId
    )
  if (!analysis) throw new Error(`${scenario.name}: analysis was not persisted`)
  const findings = await pool.query<ValidationFinding>(
    `select axis, category, confidence, evidence_message_id as "evidenceMessageId", rationale
     from conversation_findings where analysis_id = $1 order by created_at, id`,
    [analysis.id]
  )
  const flags = await pool.query<ValidationFlag>(
    `select flag_type as "flagType", detail, model, provider, signal_id as "signalId"
     from flags where workspace_id = $1 and detail ->> 'conversationId' = $2 order by created_at, id`,
    [workspaceId, conversationId]
  )
  const evidenceReferencesValid = verifyEvidence(findings.rows, messages)
  const flagDetailsPreserved = verifyFlagDetails(findings.rows, flags.rows)
  if (!evidenceReferencesValid || !flagDetailsPreserved) {
    throw new Error(
      `${scenario.name}: persisted evidence or flag detail failed`
    )
  }
  const categories = new Set(findings.rows.map((finding) => finding.category))
  const expectedCategoriesPresent = scenario.expectedCategories.every(
    (category) => categories.has(category)
  )
  const forbiddenCategoriesAbsent = scenario.forbiddenCategories.every(
    (category) => !categories.has(category)
  )
  return {
    scenario: scenario.name,
    expectedCategories: scenario.expectedCategories,
    forbiddenCategories: scenario.forbiddenCategories,
    expectedCategoryMatches: scenario.expectedCategories.map((category) => ({
      category,
      present: categories.has(category),
    })),
    transcript: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
    analysis: {
      id: analysis.id,
      analyzerVersion: analysis.analyzerVersion,
      model: outcome.model,
      tokensInput: outcome.tokensInput,
      tokensOutput: outcome.tokensOutput,
      costMicros: outcome.costMicros.toString(),
    },
    findings: findings.rows.map((finding) => ({
      axis: finding.axis,
      category: finding.category,
      confidence: finding.confidence,
      evidenceMessageId: finding.evidenceMessageId,
      evidence:
        messages.find((message) => message.id === finding.evidenceMessageId)
          ?.content ?? null,
      rationale: finding.rationale,
    })),
    flags: flags.rows.map((flag) => ({
      flagType: flag.flagType,
      provider: flag.provider,
      model: flag.model,
      detail: flag.detail,
      signalId: flag.signalId,
    })),
    automatedChecks: {
      evidenceReferencesValid,
      flagDetailsPreserved,
      expectedCategoriesPresent,
      forbiddenCategoriesAbsent,
      passed:
        evidenceReferencesValid &&
        flagDetailsPreserved &&
        expectedCategoriesPresent &&
        forbiddenCategoriesAbsent,
    },
  }
}

async function cleanupValidationWorkspace(workspaceId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("begin")
    await client.query("delete from flags where workspace_id = $1", [
      workspaceId,
    ])
    await client.query("delete from chat_messages where workspace_id = $1", [
      workspaceId,
    ])
    await client.query(
      "delete from conversation_analysis_claims where workspace_id = $1",
      [workspaceId]
    )
    await client.query("delete from organizations where id = $1", [workspaceId])
    await client.query("commit")
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}

async function runValidation(): Promise<void> {
  const model = process.env.BEHAVIOUR_VALIDATION_MODEL ?? DEFAULT_MODEL
  const keyName = resolveKeyName(model)
  if (!process.env[keyName]) {
    throw new Error(
      `${keyName} is required in .env.local for real-model validation`
    )
  }
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: "Conversation Analyzer Validation",
      slug: `conversation-analyzer-validation-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  try {
    const workflow = await repositories.workflow.createWorkflow(db, {
      workspaceId: workspace.id,
      name: "Conversation Analyzer Validation",
      slug: `conversation-analyzer-validation-${suffix}`,
    })
    const service = new ConversationAnalyzerService()
    const results: Awaited<ReturnType<typeof analyzeScenario>>[] = []
    for (const scenario of scenarios) {
      results.push(
        await analyzeScenario(
          service,
          workspace.id,
          workflow.id,
          model,
          scenario
        )
      )
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          model,
          results,
          humanReviewChecklist: [
            "Are the axes and categories correct for every finding?",
            "Are confidence values calibrated to the transcript evidence?",
            "Does each rationale accurately explain its cited message?",
            "Are there any false positives or false negatives?",
            "Does this run pass the product-surface gate?",
          ],
        },
        null,
        2
      )}\n`
    )
    const failedScenarios = results
      .filter((result) => !result.automatedChecks.passed)
      .map((result) => result.scenario)
    if (failedScenarios.length > 0) {
      throw new Error(
        `Validation failed for scenarios: ${failedScenarios.join(", ")}`
      )
    }
  } finally {
    await cleanupValidationWorkspace(workspace.id)
  }
}

async function main(): Promise<void> {
  try {
    await runValidation()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

void main()
