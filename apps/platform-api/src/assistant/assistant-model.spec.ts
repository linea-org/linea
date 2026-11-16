import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linea/db'
import { AssistantModel } from './assistant-model'
import { AssistantModelUnavailableError } from './assistant-model-error'

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
