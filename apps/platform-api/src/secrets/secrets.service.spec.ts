import '@linea/config/env'
import { randomBytes, randomUUID } from 'node:crypto'
import { db, decryptSecret, pool, repositories, schema } from '@linea/db'
import { SecretsService } from './secrets.service'

afterAll(async () => {
  await pool.end()
})

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

async function fixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Secrets test', slug: randomUUID(), createdAt: new Date() })
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
  const development = environments.find(
    (environment) => environment.environment === 'dev',
  )
  const production = environments.find(
    (environment) => environment.environment === 'production',
  )
  if (!development || !production)
    throw new Error('Application Environments missing')
  return { workspace, development, production }
}

describe('SecretsService', () => {
  it('encrypts and rotates secrets without sharing them across Environments', async () => {
    const f = await fixture()
    const service = new SecretsService()
    try {
      const created = await service.upsert(
        f.workspace.id,
        f.development.id,
        'ANTHROPIC_API_KEY',
        { value: 'development-key' },
      )
      await service.upsert(
        f.workspace.id,
        f.production.id,
        'ANTHROPIC_API_KEY',
        { value: 'production-key' },
      )
      expect(created).not.toHaveProperty('encryptedValue')
      const stored = await repositories.secret.getSecret(
        db,
        f.development.id,
        'ANTHROPIC_API_KEY',
      )
      if (!stored) throw new Error('Stored secret missing')
      expect(stored.encryptedValue).not.toBe('development-key')
      expect(decryptSecret(stored.encryptedValue)).toBe('development-key')
      await service.upsert(
        f.workspace.id,
        f.development.id,
        'ANTHROPIC_API_KEY',
        { value: 'rotated-key' },
      )
      const rotated = await repositories.secret.getSecret(
        db,
        f.development.id,
        'ANTHROPIC_API_KEY',
      )
      if (!rotated) throw new Error('Rotated secret missing')
      expect(decryptSecret(rotated.encryptedValue)).toBe('rotated-key')
      expect(rotated.id).toBe(stored.id)
      await service.delete(
        f.workspace.id,
        f.development.id,
        'ANTHROPIC_API_KEY',
      )
      expect(await service.list(f.workspace.id, f.development.id)).toEqual([])
      expect(await service.list(f.workspace.id, f.production.id)).toHaveLength(
        1,
      )
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        f.workspace.id,
      ])
    }
  })
  it('rejects access to an Environment owned by another Workspace', async () => {
    const f = await fixture()
    const service = new SecretsService()
    try {
      const otherWorkspaceId = randomUUID()
      await expect(
        service.list(otherWorkspaceId, f.development.id),
      ).rejects.toThrow('Environment not found')
      await expect(
        service.upsert(otherWorkspaceId, f.development.id, 'API_KEY', {
          value: 'unauthorized',
        }),
      ).rejects.toThrow('Environment not found')
      await expect(
        service.delete(otherWorkspaceId, f.development.id, 'API_KEY'),
      ).rejects.toThrow('Environment not found')
      expect(await service.list(f.workspace.id, f.development.id)).toEqual([])
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        f.workspace.id,
      ])
    }
  })
})
