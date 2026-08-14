import '@linea/config/env'
import { randomBytes, randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, decryptSecret, pool, repositories, schema } from '@linea/db'
import { SecretsService } from './secrets.service'

afterAll(async () => {
  await pool.end()
})

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

describe('SecretsService', () => {
  it('creates, lists (without values), updates, and deletes a secret, scoped to its workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SecretsService],
    }).compile()
    const service = moduleRef.get(SecretsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Secrets Test Org',
        slug: `secrets-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrg] = await db
      .insert(schema.organizations)
      .values({
        name: 'Secrets Test Other Org',
        slug: `secrets-test-other-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const created = await service.upsert(
        organization.id,
        'ANTHROPIC_API_KEY',
        {
          value: 'sk-workspace-key',
        },
      )
      expect(created.key).toBe('ANTHROPIC_API_KEY')
      expect(created).not.toHaveProperty('value')
      expect(created).not.toHaveProperty('encryptedValue')

      const stored = await repositories.secret.getSecret(
        db,
        organization.id,
        'ANTHROPIC_API_KEY',
      )
      expect(stored?.encryptedValue).not.toBe('sk-workspace-key')
      expect(decryptSecret(stored?.encryptedValue ?? '')).toBe(
        'sk-workspace-key',
      )

      const list = await service.list(organization.id)
      expect(list.map((s) => s.key)).toEqual(['ANTHROPIC_API_KEY'])

      expect(await service.list(otherOrg.id)).toEqual([])

      await service.upsert(organization.id, 'ANTHROPIC_API_KEY', {
        value: 'sk-rotated-key',
      })
      const rotated = await repositories.secret.getSecret(
        db,
        organization.id,
        'ANTHROPIC_API_KEY',
      )
      expect(decryptSecret(rotated?.encryptedValue ?? '')).toBe(
        'sk-rotated-key',
      )

      await service.delete(organization.id, 'ANTHROPIC_API_KEY')
      expect(await service.list(organization.id)).toEqual([])

      await expect(
        service.delete(organization.id, 'ANTHROPIC_API_KEY'),
      ).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        organization.id,
        otherOrg.id,
      ])
    }
  })
})
