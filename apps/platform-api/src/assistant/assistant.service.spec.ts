import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { ToolCall } from '@linealabs/ai'
import { db, pool, repositories, schema } from '@linealabs/db'
import type { AssistantModel } from './assistant-model'
import { AssistantModelUnavailableError } from './assistant-model-error'
import type { ToolOutcome } from './assistant-tool-outcome'
import type { AssistantTools } from './assistant-tools'
import { AssistantService } from './assistant.service'

afterAll(async () => {
  await pool.end()
})

const validGraph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', config: { triggerType: 'manual' } },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [{ from: 'start', to: 'end' }],
}

async function fixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: 'Assistant test',
      slug: randomUUID(),
      createdAt: new Date(),
    })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'Support',
    slug: 'support',
  })
  const [user] = await db
    .insert(schema.users)
    .values({ name: 'Tester', email: `${randomUUID()}@test.dev` })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: workspace.id,
    applicationId: application.id,
    name: 'Flow',
    slug: 'flow',
  })
  return { workspace, application, workflow, user }
}

type Step = string | { toolCalls: ToolCall[] }
type CompleteArgs = [
  string,
  string,
  { prompt?: string; tools?: unknown[]; history: unknown[] },
  string | undefined,
]

function modelReturning(...steps: Step[]) {
  const complete = jest.fn<Promise<unknown>, CompleteArgs>()
  for (const step of steps) {
    complete.mockResolvedValueOnce(
      typeof step === 'string'
        ? { text: step, model: 'test-model', tokensInput: 1, tokensOutput: 1 }
        : {
            text: '',
            toolCalls: step.toolCalls,
            tokensInput: 1,
            tokensOutput: 1,
          },
    )
  }
  return { complete } as unknown as AssistantModel & {
    complete: typeof complete
  }
}

function toolsReturning(outcome: ToolOutcome) {
  const run = jest
    .fn<Promise<ToolOutcome>, [ToolCall, unknown]>()
    .mockResolvedValue(outcome)
  return { run } as unknown as AssistantTools & { run: typeof run }
}

const fetched: ToolOutcome = {
  content: 'HTTP 200. page text',
  action: {
    kind: 'fetch',
    url: 'https://example.com',
    status: 200,
    error: null,
  },
}
const noTools = toolsReturning(fetched)
const request = {
  message: 'build me a flow',
  tools: { web: false },
  attachments: [],
}
const fetchCall: ToolCall = {
  id: 'call-1',
  name: 'fetch_url',
  arguments: { url: 'https://example.com' },
}

describe('AssistantService', () => {
  it('returns a valid graph proposal', async () => {
    const f = await fixture()
    const model = modelReturning(
      JSON.stringify({ reply: 'Built it', graph: validGraph }),
    )
    const answer = await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      request,
    )
    expect(answer.reply).toBe('Built it')
    expect(answer.graph?.nodes).toHaveLength(2)
    expect(model.complete).toHaveBeenCalledTimes(1)
  })

  it('answers a plain-text reply directly, without a retry', async () => {
    const f = await fixture()
    const model = modelReturning('Branch nodes route on a value.')
    const answer = await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      request,
    )
    expect(answer).toMatchObject({
      reply: 'Branch nodes route on a value.',
      title: null,
      graph: null,
      actions: [],
    })
    expect(model.complete).toHaveBeenCalledTimes(1)
  })

  it('retries once with the validation error, then returns the fixed graph', async () => {
    const f = await fixture()
    const model = modelReturning(
      JSON.stringify({
        reply: 'First try',
        graph: { ...validGraph, edges: [] },
      }),
      JSON.stringify({ reply: 'Fixed', graph: validGraph }),
    )
    const answer = await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      request,
    )
    expect(answer.reply).toBe('Fixed')
    expect(model.complete).toHaveBeenCalledTimes(2)
    expect(model.complete.mock.calls[1][2].prompt).toContain(
      'Your last answer was rejected',
    )
  })

  it('gives up after two invalid answers and never returns a graph', async () => {
    const f = await fixture()
    const model = modelReturning('{ not json', '{ still not json')
    const answer = await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      request,
    )
    expect(answer.graph).toBeNull()
    expect(answer.reply).toMatch(/couldn't produce a valid workflow/)
    expect(model.complete).toHaveBeenCalledTimes(2)
  })

  it('runs a tool the model asks for and answers with the result', async () => {
    const f = await fixture()
    const model = modelReturning(
      { toolCalls: [fetchCall] },
      'The page says hello.',
    )
    const tools = toolsReturning(fetched)
    const answer = await new AssistantService(model, tools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      { ...request, tools: { web: true } },
    )
    expect(tools.run).toHaveBeenCalledWith(fetchCall, {
      workspaceId: f.workspace.id,
      applicationId: f.application.id,
      userId: f.user.id,
      web: true,
    })
    expect(answer.reply).toBe('The page says hello.')
    expect(answer.actions).toEqual([fetched.action])
    const second = model.complete.mock.calls[1][2]
    expect(second.prompt).toBeUndefined()
    expect(second.history.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      content: fetched.content,
    })
  })

  it('offers the web tool only when it was switched on', async () => {
    const f = await fixture()
    const off = modelReturning('hi')
    await new AssistantService(off, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      request,
    )
    expect(off.complete.mock.calls[0][2].tools).toHaveLength(1)
    const on = modelReturning('hi')
    await new AssistantService(on, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      { ...request, tools: { web: true } },
    )
    expect(on.complete.mock.calls[0][2].tools).toHaveLength(2)
  })

  it('stops after too many tool rounds', async () => {
    const f = await fixture()
    const model = modelReturning(...Array(6).fill({ toolCalls: [fetchCall] }))
    const answer = await new AssistantService(
      model,
      toolsReturning(fetched),
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, {
      ...request,
      tools: { web: true },
    })
    expect(answer.graph).toBeNull()
    expect(answer.reply).toMatch(/too many steps/)
  })

  it('uses the model chosen for this message', async () => {
    const f = await fixture()
    const model = modelReturning('hi')
    await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      { ...request, model: 'gpt-5' },
    )
    expect(model.complete.mock.calls[0][3]).toBe('gpt-5')
  })

  it('reports a model that is not set up as a readable 422', async () => {
    const f = await fixture()
    const model = {
      complete: jest
        .fn()
        .mockRejectedValue(
          new AssistantModelUnavailableError('Choose a model first.'),
        ),
    } as unknown as AssistantModel
    await expect(
      new AssistantService(model, noTools).replyForWorkflow(
        f.workspace.id,
        f.user.id,
        f.workflow.id,
        request,
      ),
    ).rejects.toThrow(UnprocessableEntityException)
  })

  it('does not reach into another workspace', async () => {
    const f = await fixture()
    const other = await fixture()
    await expect(
      new AssistantService(modelReturning(), noTools).replyForWorkflow(
        other.workspace.id,
        f.user.id,
        f.workflow.id,
        request,
      ),
    ).rejects.toThrow(NotFoundException)
  })

  it('answers at application level, with a title for a new workflow', async () => {
    const f = await fixture()
    const model = modelReturning(
      JSON.stringify({
        reply: 'Built',
        graph: validGraph,
        title: 'Todo router',
      }),
    )
    const answer = await new AssistantService(
      model,
      noTools,
    ).replyForApplication(f.workspace.id, f.user.id, f.application.id, request)
    expect(answer.title).toBe('Todo router')
    expect(answer.graph?.nodes).toHaveLength(2)
  })

  it('does not reach into another workspace at application level', async () => {
    const f = await fixture()
    const other = await fixture()
    await expect(
      new AssistantService(modelReturning(), noTools).replyForApplication(
        other.workspace.id,
        f.user.id,
        f.application.id,
        request,
      ),
    ).rejects.toThrow(NotFoundException)
  })

  it('saves the exchange, with the proposal, actions and model', async () => {
    const f = await fixture()
    const model = modelReturning(
      { toolCalls: [fetchCall] },
      JSON.stringify({ reply: 'Built', graph: validGraph, title: 'Router' }),
    )
    const answer = await new AssistantService(
      model,
      toolsReturning(fetched),
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, {
      ...request,
      tools: { web: true },
    })
    const saved =
      await repositories.assistantConversation.listAssistantMessages(
        db,
        f.workspace.id,
        answer.conversationId,
      )
    expect(saved.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(saved[0].content).toBe(request.message)
    expect(saved[1]).toMatchObject({
      content: 'Built',
      model: 'test-model',
      actions: [fetched.action],
      proposal: { title: 'Router' },
    })
  })

  it('continues a saved chat from what was stored, not from the browser', async () => {
    const f = await fixture()
    const first = await new AssistantService(
      modelReturning('Hello there.'),
      noTools,
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, request)
    const model = modelReturning('Sure.')
    await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      {
        ...request,
        message: 'and again',
        conversationId: first.conversationId,
      },
    )
    expect(model.complete.mock.calls[0][2].history).toEqual([
      { role: 'user', content: request.message },
      { role: 'assistant', content: 'Hello there.' },
    ])
  })

  it('branches from an earlier message and answers from that branch only', async () => {
    const f = await fixture()
    const first = await new AssistantService(
      modelReturning('Hello there.'),
      noTools,
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, request)
    await new AssistantService(
      modelReturning('Sure.'),
      noTools,
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, {
      ...request,
      message: 'and again',
      conversationId: first.conversationId,
    })
    const model = modelReturning('Edited.')
    const edited = await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      {
        ...request,
        message: 'a different follow-up',
        conversationId: first.conversationId,
        parentMessageId: first.messageId,
      },
    )
    expect(model.complete.mock.calls[0][2].history).toEqual([
      { role: 'user', content: request.message },
      { role: 'assistant', content: 'Hello there.' },
    ])
    const saved =
      await repositories.assistantConversation.listAssistantMessages(
        db,
        f.workspace.id,
        first.conversationId,
      )
    const sibling = saved.find((m) => m.id === edited.userMessageId)
    expect(sibling?.parentId).toBe(first.messageId)
    expect(saved.filter((m) => m.parentId === first.messageId)).toHaveLength(2)
  })

  it('saves attachments and keeps them in the chat context', async () => {
    const f = await fixture()
    const file = { name: 'notes.txt', content: 'alpha beta' }
    const first = await new AssistantService(
      modelReturning('Read it.'),
      noTools,
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, {
      ...request,
      attachments: [file],
    })
    const saved =
      await repositories.assistantConversation.listAssistantMessages(
        db,
        f.workspace.id,
        first.conversationId,
      )
    expect(saved[0].attachments).toEqual([file])
    const model = modelReturning('Again.')
    await new AssistantService(model, noTools).replyForWorkflow(
      f.workspace.id,
      f.user.id,
      f.workflow.id,
      {
        ...request,
        message: 'and again',
        conversationId: first.conversationId,
      },
    )
    const [firstTurn] = model.complete.mock.calls[0][2].history as {
      content: string
    }[]
    expect(firstTurn.content).toContain('alpha beta')
  })

  it('titles a new chat from its first message', async () => {
    const f = await fixture()
    const answer = await new AssistantService(
      modelReturning('ok'),
      noTools,
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, {
      ...request,
      message: 'x'.repeat(200),
    })
    const chat =
      await repositories.assistantConversation.getAssistantConversation(
        db,
        f.workspace.id,
        f.user.id,
        answer.conversationId,
      )
    expect(chat?.title).toHaveLength(60)
    expect(chat?.title.endsWith('…')).toBe(true)
  })

  it("refuses to continue another member's chat or one from another place", async () => {
    const f = await fixture()
    const mine = await new AssistantService(
      modelReturning('hi'),
      noTools,
    ).replyForWorkflow(f.workspace.id, f.user.id, f.workflow.id, request)
    const [stranger] = await db
      .insert(schema.users)
      .values({ name: 'Other', email: `${randomUUID()}@test.dev` })
      .returning()
    const service = new AssistantService(modelReturning('no'), noTools)
    await expect(
      service.replyForWorkflow(f.workspace.id, stranger.id, f.workflow.id, {
        ...request,
        conversationId: mine.conversationId,
      }),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.replyForApplication(f.workspace.id, f.user.id, f.application.id, {
        ...request,
        conversationId: mine.conversationId,
      }),
    ).rejects.toThrow(NotFoundException)
  })
})
