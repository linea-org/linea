import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { registry } from '@linea/ai'
import { db, pool, schema } from '@linea/db'
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
})
