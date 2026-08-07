import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, schema } from '@linea/db'
import { ApiKeysService } from './api-keys.service'
import { hashApiKey } from '../auth/api-key.util'

afterAll(async () => {
  await pool.end()
})

describe('ApiKeysService', () => {
  it('creates a key, returns the raw key once, and never leaks the hash', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeysService],
    }).compile()
    const service = moduleRef.get(ApiKeysService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'API Keys Test Org',
        slug: `api-keys-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const created = await service.create(organization.id, {
        name: 'CI key',
      })

      expect(created.rawKey.startsWith('lin_')).toBe(true)
      expect(created).not.toHaveProperty('hashedKey')

      const listed = await service.list(organization.id)
      expect(listed).toHaveLength(1)
      expect(listed[0]).not.toHaveProperty('hashedKey')
      expect(listed[0].keyPrefix).toBe(created.keyPrefix)

      const { rows } = await pool.query<{ hashed_key: string }>(
        'SELECT hashed_key FROM api_keys WHERE id = $1',
        [created.id],
      )
      expect(rows[0]?.hashed_key).toBe(hashApiKey(created.rawKey))
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('revoking a key scoped to the wrong workspace throws NotFoundException', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeysService],
    }).compile()
    const service = moduleRef.get(ApiKeysService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'API Keys Revoke Test Org',
        slug: `api-keys-revoke-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrg] = await db
      .insert(schema.organizations)
      .values({
        name: 'Other Org',
        slug: `other-org-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const created = await service.create(organization.id, {
        name: 'CI key',
      })

      await expect(service.revoke(otherOrg.id, created.id)).rejects.toThrow()

      const revoked = await service.revoke(organization.id, created.id)
      expect(revoked.revokedAt).toBeInstanceOf(Date)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        organization.id,
        otherOrg.id,
      ])
    }
  })
})
