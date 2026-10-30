import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'
import { AgentContractsController } from './agent-contracts.controller'
import { AgentContractsService } from './agent-contracts.service'
import { EnvironmentAgentBindingsController } from '../environments/environment-agent-bindings.controller'
import { EnvironmentAgentBindingsService } from '../environments/environment-agent-bindings.service'

const mockRole = jest.fn<Promise<string | null>, unknown[]>()
const mockApiKey = jest.fn<
  Promise<
    | { id: string; workspaceId: string; purpose: string; revokedAt: null }
    | undefined
  >,
  unknown[]
>()

jest.mock('@linea/db', () => ({
  db: {},
  repositories: {
    organization: { getMemberRole: (...args: unknown[]) => mockRole(...args) },
    apiKey: {
      getApiKeyByHash: (...args: unknown[]) => mockApiKey(...args),
      touchApiKeyLastUsed: jest.fn(),
    },
  },
}))

const applicationId = '719b1d02-27ef-40df-ab8b-950b69d4a15b'
const mockList = jest.fn().mockResolvedValue([])

describe('Agent management authorization', () => {
  let app: INestApplication<App>
  let signedIn: boolean
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AgentsController,
        AgentContractsController,
        EnvironmentAgentBindingsController,
      ],
      providers: [
        { provide: AgentsService, useValue: { list: mockList } },
        { provide: AgentContractsService, useValue: { list: mockList } },
        {
          provide: EnvironmentAgentBindingsService,
          useValue: { list: mockList },
        },
      ],
    }).compile()
    app = module.createNestApplication()
    app.use(
      (
        req: Request & { session?: unknown },
        _res: Response,
        next: NextFunction,
      ) => {
        if (signedIn)
          req.session = {
            user: { id: applicationId },
            session: { activeOrganizationId: applicationId },
          }
        next()
      },
    )
    await app.init()
  })
  beforeEach(() => {
    signedIn = true
    mockRole.mockReset().mockResolvedValue('admin')
    mockApiKey.mockReset().mockResolvedValue(undefined)
    mockList.mockClear()
  })
  afterAll(async () => {
    await app.close()
  })
  const paths = [
    `/agents?applicationId=${applicationId}`,
    `/agents/${applicationId}/contracts`,
    `/environments/${applicationId}/agent-bindings`,
  ]
  it('requires authentication on every management resource', async () => {
    signedIn = false
    for (const path of paths)
      await request(app.getHttpServer()).get(path).expect(401)
    expect(mockList).not.toHaveBeenCalled()
  })
  it('requires an admin session even for a valid workspace API key', async () => {
    signedIn = false
    mockApiKey.mockResolvedValue({
      id: applicationId,
      workspaceId: applicationId,
      purpose: 'general',
      revokedAt: null,
    })
    for (const path of paths)
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer test-key')
        .expect(403)
    expect(mockList).not.toHaveBeenCalled()
  })
  it('rejects ordinary members and permits workspace admins', async () => {
    mockRole.mockResolvedValue('member')
    for (const path of paths)
      await request(app.getHttpServer()).get(path).expect(403)
    expect(mockList).not.toHaveBeenCalled()
    mockRole.mockResolvedValue('admin')
    for (const path of paths)
      await request(app.getHttpServer()).get(path).expect(200)
    expect(mockList).toHaveBeenCalledTimes(3)
    expect(mockList).toHaveBeenCalledWith(applicationId, applicationId)
  })
  it('validates resource identifiers before calling services', async () => {
    await request(app.getHttpServer())
      .get('/agents?applicationId=invalid')
      .expect(400)
    await request(app.getHttpServer())
      .get('/agents/invalid/contracts')
      .expect(400)
    await request(app.getHttpServer())
      .get('/environments/invalid/agent-bindings')
      .expect(400)
    expect(mockList).not.toHaveBeenCalled()
  })
})
