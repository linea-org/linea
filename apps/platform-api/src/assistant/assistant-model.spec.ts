import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { resolveProvider } from '@linealabs/ai'
import { db, pool, repositories, schema } from '@linealabs/db'
import { AssistantModel } from './assistant-model'
import { AssistantModelUnavailableError } from './assistant-model-error'

afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  await pool.end()
})

async function environmentFixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Model test', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'Support',
    slug: 'support',
  })
  const environments = await repositories.environment.listEnvironments(
    db,
    workspace.id,
    application.id,
  )
  const development = environments.find((item) => item.environment === 'dev')
  if (!development) throw new Error('Development Environment missing')
  return { workspace, development }
}

const request = { prompt: 'hello' }

describe('AssistantModel', () => {
  it('refuses to run until a model is chosen', async () => {
    const f = await environmentFixture()
    await expect(
      new AssistantModel().complete(f.workspace.id, f.development.id, request),
    ).rejects.toThrow(/Choose a model in Settings/)
  })

  it('refuses a saved model that no longer exists', async () => {
    const f = await environmentFixture()
    await repositories.workspaceSettings.updateWorkspaceSettings(
      db,
      f.workspace.id,
      { defaultModel: 'retired-model' },
    )
    await expect(
      new AssistantModel().complete(f.workspace.id, f.development.id, request),
    ).rejects.toBeInstanceOf(AssistantModelUnavailableError)
  })

  async function withRefusedToolCalls(times: number) {
    const f = await environmentFixture()
    await repositories.secret.upsertSecret(
      db,
      f.development.id,
      'OPENAI_API_KEY',
      'sk-test',
    )
    const refused = Object.assign(new Error('tool call validation failed'), {
      status: 400,
      code: 'tool_use_failed',
    })
    const complete = jest
      .spyOn(resolveProvider('gpt-5'), 'complete')
      .mockResolvedValue({ text: 'ok', tokensInput: 1, tokensOutput: 1 })
    for (let i = 0; i < times; i++) complete.mockRejectedValueOnce(refused)
    const ask = () =>
      new AssistantModel().complete(
        f.workspace.id,
        f.development.id,
        request,
        'gpt-5',
      )
    return { ask, complete }
  }

  it('asks once more when the provider refuses the model’s tool call', async () => {
    const { ask, complete } = await withRefusedToolCalls(1)
    await expect(ask()).resolves.toMatchObject({ text: 'ok' })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('explains a tool call that is refused twice', async () => {
    const { ask, complete } = await withRefusedToolCalls(2)
    await expect(ask()).rejects.toThrow(AssistantModelUnavailableError)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('names the provider to add a key for when the chosen model has none', async () => {
    const f = await environmentFixture()
    await repositories.workspaceSettings.updateWorkspaceSettings(
      db,
      f.workspace.id,
      { defaultModel: 'gpt-5' },
    )
    await expect(
      new AssistantModel().complete(f.workspace.id, f.development.id, request),
    ).rejects.toThrow(/Add your OpenAI API key in Settings/)
  })
})
