import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, schema } from '@linea/db'
import { ApiKeysService } from './api-keys.service'
import { createApiKeySchema } from './dto/create-api-key.dto'
import { hashApiKey } from '../auth/api-key.util'

afterAll(async () => {
  await pool.end()
})

async function createUser(suffix: string) {
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'API Keys Admin',
      email: `api-keys-${suffix}@example.com`,
    })
    .returning()
  return user
}

async function createOrganization(slug: string) {
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name: 'API Keys Test Org', slug, createdAt: new Date() })
    .returning()
  return organization
}

describe('ApiKeysService', () => {
  it('creates a scoped, expiring key attributed to its creator, returns the raw key once, and never leaks the hash', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeysService],
    }).compile()
    const service = moduleRef.get(ApiKeysService)
    const suffix = randomUUID()
    const organization = await createOrganization(`api-keys-test-${suffix}`)
    const user = await createUser(suffix)
    try {
      const before = Date.now()
      const created = await service.create(organization.id, user.id, {
        name: 'CI key',
        scopes: ['regressions:read', 'audit:read'],
        expiresInDays: 30,
      })
      expect(created.rawKey.startsWith('lin_')).toBe(true)
      expect(created).not.toHaveProperty('hashedKey')
      expect(created.scopes).toEqual(['regressions:read', 'audit:read'])
      expect(created.createdByUserId).toBe(user.id)
      expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 30 * 86_400_000,
      )
      const listed = await service.list(organization.id)
      expect(listed).toHaveLength(1)
      expect(listed[0]).not.toHaveProperty('hashedKey')
      expect(listed[0].keyPrefix).toBe(created.keyPrefix)
      expect(listed[0].createdBy).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      const { rows } = await pool.query<{ hashed_key: string }>(
        'SELECT hashed_key FROM api_keys WHERE id = $1',
        [created.id],
      )
      expect(rows[0]?.hashed_key).toBe(hashApiKey(created.rawKey))
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    }
  })

  it('revoking a key scoped to the wrong workspace throws NotFoundException', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeysService],
    }).compile()
    const service = moduleRef.get(ApiKeysService)
    const suffix = randomUUID()
    const organization = await createOrganization(
      `api-keys-revoke-test-${suffix}`,
    )
    const otherOrg = await createOrganization(`other-org-${suffix}`)
    const user = await createUser(suffix)
    try {
      const created = await service.create(organization.id, user.id, {
        name: 'CI key',
        scopes: ['regressions:read'],
        expiresInDays: 1,
      })
      await expect(
        service.revoke(otherOrg.id, user.id, created.id),
      ).rejects.toThrow()
      const revoked = await service.revoke(organization.id, user.id, created.id)
      expect(revoked.revokedAt).toBeInstanceOf(Date)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        organization.id,
        otherOrg.id,
      ])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    }
  })
})

describe('createApiKeySchema', () => {
  const valid = {
    name: 'CI key',
    scopes: ['regressions:read'],
    expiresInDays: 90,
  }

  it('accepts known scopes and a bounded lifetime', () => {
    expect(createApiKeySchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['an unknown scope', { ...valid, scopes: ['keys:write'] }],
    ['no scopes', { ...valid, scopes: [] }],
    ['repeated scopes', { ...valid, scopes: ['audit:read', 'audit:read'] }],
    ['a missing expiry', { name: 'CI key', scopes: ['audit:read'] }],
    ['a lifetime over a year', { ...valid, expiresInDays: 366 }],
    ['a non-integer lifetime', { ...valid, expiresInDays: 1.5 }],
    ['unknown fields', { ...valid, purpose: 'platform' }],
  ])('rejects %s', (_label, input) => {
    expect(createApiKeySchema.safeParse(input).success).toBe(false)
  })
})
