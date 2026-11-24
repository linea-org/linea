import 'dotenv/config'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { db, encryptSecret, pool, repositories, schema } from '@linealabs/db'
import {
  configureTestEnvironment,
  getTestApplicationId,
} from '@linealabs/db/testing'
import {
  regressionCaseSchema,
  regressionRunDetailSchema,
  regressionRunSchema,
} from '@linealabs/protocol/resources'
import { randomBytes } from 'node:crypto'
import request from 'supertest'
import type { Server } from 'node:http'
import { generateApiKey } from '../auth/api-key.util'
import { bigIntJsonReplacer } from '../common/bigint-json-replacer'
import {
  deleteAuthorizationWorkspace,
  seedAuthorizationWorkspace,
  testUserSession,
  type AuthorizationTestWorkspace,
} from '../executions/test-authorization-workspace'
import { canReadDiagnosticContent } from '../executions/end-user-trace-access'
import { REDACTED } from '../executions/trace-redaction'
import { RegressionRunQueueService } from '../queue/regression-run-queue.service'
import { RegressionCasesController } from './regression-cases.controller'
import { RegressionCasesService } from './regression-cases.service'
import { RegressionRunsController } from './regression-runs.controller'
import { RegressionRunsService } from './regression-runs.service'

const originalSecretsKey = process.env.SECRETS_ENCRYPTION_KEY
const key = generateApiKey()
const credential = 'ghp_abcdefghijklmnopqrstuvwxyz012345'
const secrets = ['opaque-crm-value', 'opaque-erp-value']
const recordedInput = {
  nodeInput: {
    question: 'Private roadmap',
    token: credential,
    message: `sent ${secrets.join(' and ')}`,
  },
}
const recordedOutput = {
  answer: 'Private answer',
  note: `sent ${credential}`,
  echo: secrets[1],
}

describe('Regression content access', () => {
  let app: NestExpressApplication<Server>
  let seeded: AuthorizationTestWorkspace
  let ownerId: string
  let path: string
  let caseId: string
  let runId: string

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    seeded = await seedAuthorizationWorkspace('Regression content', key)
    const [owner] = await db
      .insert(schema.users)
      .values({ name: 'owner', email: `${key.keyPrefix}-owner@test.dev` })
      .returning()
    ownerId = owner.id
    await db.insert(schema.members).values({
      organizationId: seeded.workspaceId,
      userId: ownerId,
      role: 'owner',
      createdAt: new Date(),
    })
    const applicationId = await getTestApplicationId(db, seeded.workspaceId)
    // The same name in two Environments, as Development and Production have.
    for (const [index, environment] of (
      ['dev', 'production'] as const
    ).entries()) {
      const { id } = await configureTestEnvironment(db, {
        workspaceId: seeded.workspaceId,
        applicationId,
        environment,
        displayName: environment,
        allowedBrowserOrigins: ['http://127.0.0.1:4173'],
        allowedRedirectOrigins: ['http://127.0.0.1:4173'],
        oidcIssuer: 'https://identity.example.com',
        oidcClientId: environment,
        oidcAudience: environment,
        oidcJwksUrl: 'https://identity.example.com/jwks',
      })
      await repositories.secret.upsertSecret(
        db,
        id,
        'CRM_KEY',
        encryptSecret(secrets[index]),
      )
    }
    const workflow = await repositories.workflow.createWorkflow(db, {
      applicationId,
      workspaceId: seeded.workspaceId,
      name: 'Regression content',
      slug: `regression-content-${key.keyPrefix}`,
    })
    path = `/workflows/${workflow.id}`
    const version = await repositories.workflow.createWorkflowVersion(db, {
      workflowId: workflow.id,
      graph: { nodes: [], edges: [] },
      contentHash: 'regression-content',
    })
    const regressionCase =
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: seeded.workspaceId,
        workflowId: workflow.id,
        caseType: 'node',
        nodeId: 'n1',
        input: recordedInput,
      })
    caseId = regressionCase.id
    const run = await repositories.regressionRun.createRegressionRun(db, {
      workspaceId: seeded.workspaceId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      trigger: 'manual',
    })
    runId = run.id
    await repositories.regressionRun.insertRegressionResults(
      db,
      runId,
      seeded.workspaceId,
      [{ caseId, status: 'passed', output: recordedOutput }],
    )
    await repositories.regressionRun.completeRegressionRun(
      db,
      seeded.workspaceId,
      runId,
      { passed: 1, failed: 0, total: 1, costMicros: 0n },
    )
    const moduleRef = await Test.createTestingModule({
      controllers: [RegressionCasesController, RegressionRunsController],
      providers: [
        RegressionCasesService,
        RegressionRunsService,
        { provide: RegressionRunQueueService, useValue: {} },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication<Server>>()
    app.use(testUserSession(seeded.workspaceId))
    app.set('json replacer', bigIntJsonReplacer)
    await app.init()
  })

  afterAll(async () => {
    if (originalSecretsKey === undefined)
      delete process.env.SECRETS_ENCRYPTION_KEY
    else process.env.SECRETS_ENCRYPTION_KEY = originalSecretsKey
    await app?.close()
    await deleteAuthorizationWorkspace(seeded)
    await pool.query('DELETE FROM users WHERE id = $1', [ownerId])
    await pool.end()
  })

  async function read(auth: Record<string, string>) {
    const server = app.getHttpServer()
    const get = async (route: string) =>
      (await request(server).get(`${path}${route}`).set(auth).expect(200))
        .body as unknown
    return {
      cases: regressionCaseSchema
        .array()
        .parse(await get('/regression-cases?includeArchived=true')),
      runs: regressionRunSchema.array().parse(await get('/regression-runs')),
      run: regressionRunDetailSchema.parse(
        await get(`/regression-runs/${runId}`),
      ),
    }
  }

  it('keeps recorded input and output from members and workspace API keys, but not whether a case passed', async () => {
    const restricted: Record<string, string>[] = [
      { 'x-test-user': seeded.memberId },
      { Authorization: `Bearer ${key.rawKey}` },
    ]
    for (const auth of restricted) {
      const seen = await read(auth)
      expect(seen.cases).toEqual([
        expect.objectContaining({ id: caseId, nodeId: 'n1', input: null }),
      ])
      expect(seen.runs).toEqual([
        expect.objectContaining({ id: runId, passed: 1, total: 1 }),
      ])
      expect(seen.run.results).toEqual([
        expect.objectContaining({ caseId, status: 'passed', output: null }),
      ])
      expect(JSON.stringify(seen)).not.toContain('Private')
    }
  })

  it('shows admins and owners the recorded content without its credentials', async () => {
    for (const userId of [seeded.adminId, ownerId]) {
      const seen = await read({ 'x-test-user': userId })
      expect(seen.cases[0].input).toEqual({
        nodeInput: {
          question: 'Private roadmap',
          token: REDACTED,
          message: 'sent [secret CRM_KEY] and [secret CRM_KEY]',
        },
      })
      expect(seen.run.results[0].output).toEqual({
        answer: 'Private answer',
        note: `sent ${REDACTED}`,
        echo: '[secret CRM_KEY]',
      })
      for (const value of [credential, ...secrets])
        expect(JSON.stringify(seen)).not.toContain(value)
    }
  })

  it('treats a signed-in outsider as restricted', async () => {
    await pool.query(
      'DELETE FROM members WHERE organization_id = $1 AND user_id = $2',
      [seeded.workspaceId, seeded.adminId],
    )
    expect(
      await canReadDiagnosticContent(seeded.workspaceId, seeded.adminId),
    ).toBe(false)
    expect(await canReadDiagnosticContent(seeded.workspaceId, undefined)).toBe(
      false,
    )
    expect(await canReadDiagnosticContent(seeded.workspaceId, ownerId)).toBe(
      true,
    )
  })

  it('leaves the saved case as it was recorded, for the runs that use it', async () => {
    const saved = await repositories.regressionCase.getRegressionCaseById(
      db,
      seeded.workspaceId,
      caseId,
    )
    expect(saved?.input).toEqual(recordedInput)
  })
})
