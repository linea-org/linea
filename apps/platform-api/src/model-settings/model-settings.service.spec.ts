import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { registry } from '@linea/ai'
import { db, encryptSecret, pool, repositories, schema } from '@linea/db'
import { getTestApplicationId } from '@linea/db/testing'
import { buildModelCatalog } from './model-catalog'
import { ModelSettingsService } from './model-settings.service'

afterAll(async () => {
  await pool.end()
})

async function workspaceId() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: 'Settings test',
      slug: randomUUID(),
      createdAt: new Date(),
    })
    .returning()
  return workspace.id
}

describe('model catalog', () => {
  it('lists every registered model with a label and a provider', () => {
    const catalog = buildModelCatalog()
    expect(catalog.map((model) => model.value).sort()).toEqual(
      Object.keys(registry).sort(),
    )
    for (const model of catalog) {
      expect(model.label).not.toBe('')
      expect(model.providerLabel).not.toBe('')
    }
  })
})

describe('ModelSettingsService', () => {
  it('starts with no model chosen', async () => {
    const settings = await new ModelSettingsService().get(await workspaceId())
    expect(settings.defaultModel).toBeNull()
    expect(settings.models.length).toBeGreaterThan(0)
  })

  it('saves and clears the chosen model', async () => {
    const service = new ModelSettingsService()
    const id = await workspaceId()
    expect(
      (await service.update(id, { defaultModel: 'gpt-5' })).defaultModel,
    ).toBe('gpt-5')
    expect(
      (await service.update(id, { defaultModel: null })).defaultModel,
    ).toBeNull()
  })

  it('saves each task model without touching the others', async () => {
    const service = new ModelSettingsService()
    const id = await workspaceId()
    await service.update(id, { defaultModel: 'gpt-5' })
    const settings = await service.update(id, { judgeModel: 'gpt-5-mini' })
    expect(settings.defaultModel).toBe('gpt-5')
    expect(settings.judgeModel).toBe('gpt-5-mini')
    expect(settings.behaviourModel).toBeNull()
    expect(settings.stepModel).toBeNull()
  })

  it('rejects a model that is not registered', async () => {
    await expect(
      new ModelSettingsService().update(await workspaceId(), {
        defaultModel: 'made-up-model',
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('keeps each workspace separate', async () => {
    const service = new ModelSettingsService()
    const a = await workspaceId()
    const b = await workspaceId()
    await service.update(a, { defaultModel: 'gpt-5' })
    expect((await service.get(b)).defaultModel).toBeNull()
  })

  it('reports every provider as unconnected before an application exists', async () => {
    const { providers } = await new ModelSettingsService().get(
      await workspaceId(),
    )
    expect(providers.length).toBeGreaterThan(0)
    expect(providers.every((provider) => !provider.configured)).toBe(true)
  })

  it('shows which providers have a key without exposing its value', async () => {
    const workspace = await workspaceId()
    const applicationId = await getTestApplicationId(db, workspace)
    const environments = await repositories.environment.listEnvironments(
      db,
      workspace,
      applicationId,
    )
    const development = environments.find((item) => item.environment === 'dev')!
    const [first] = (await new ModelSettingsService().get(workspace)).providers
    await repositories.secret.upsertSecret(
      db,
      development.id,
      first.keyName,
      encryptSecret('sk-never-shown'),
    )
    const settings = await new ModelSettingsService().get(workspace)
    expect(
      settings.providers.find((provider) => provider.keyName === first.keyName)
        ?.configured,
    ).toBe(true)
    expect(JSON.stringify(settings)).not.toContain('sk-never-shown')
  })

  it('keeps reading the oldest application after another is created', async () => {
    const workspace = await workspaceId()
    const applicationId = await getTestApplicationId(db, workspace)
    const environments = await repositories.environment.listEnvironments(
      db,
      workspace,
      applicationId,
    )
    const development = environments.find((item) => item.environment === 'dev')!
    const [first] = (await new ModelSettingsService().get(workspace)).providers
    await repositories.secret.upsertSecret(
      db,
      development.id,
      first.keyName,
      encryptSecret('sk-test'),
    )
    await db
      .insert(schema.applications)
      .values({ workspaceId: workspace, name: 'Newer', slug: 'newer' })
    const settings = await new ModelSettingsService().get(workspace)
    expect(
      settings.providers.find((provider) => provider.keyName === first.keyName)
        ?.configured,
    ).toBe(true)
  })

  it('rejects an application from another workspace', async () => {
    const other = await getTestApplicationId(db, await workspaceId())
    await expect(
      new ModelSettingsService().get(await workspaceId(), other),
    ).rejects.toThrow(NotFoundException)
  })
})
