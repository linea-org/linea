import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { pool } from '@linea/db'
import request from 'supertest'
import type { Server } from 'node:http'
import { generateApiKey } from '../auth/api-key.util'
import { RegressionCasesController } from '../regressions/regression-cases.controller'
import { RegressionCasesService } from '../regressions/regression-cases.service'
import { RegressionRunsController } from '../regressions/regression-runs.controller'
import { RegressionRunsService } from '../regressions/regression-runs.service'
import { ExecutionsController } from './executions.controller'
import { ExecutionsService } from './executions.service'
import {
  deleteAuthorizationWorkspace,
  seedAuthorizationWorkspace,
  testUserSession,
} from './test-authorization-workspace'

function notFound() {
  return jest.fn(() => Promise.reject(new NotFoundException()))
}

describe('Replay and Regression HTTP authorization', () => {
  let app: NestExpressApplication<Server>
  let workspaceId: string
  let adminId: string
  let memberId: string
  const key = generateApiKey()
  const executions = { replayStep: notFound() }
  const regressionRuns = { trigger: notFound(), list: jest.fn(() => []) }
  const regressionCases = {
    createFromStep: notFound(),
    createFromFlag: notFound(),
    archive: notFound(),
  }
  const id = randomUUID()
  const routes = [
    { path: `/executions/${id}/steps/${id}/replay`, body: {} },
    { path: `/workflows/${id}/regression-runs`, body: {} },
    {
      path: `/workflows/${id}/regression-cases/from-step`,
      body: { stepId: id },
    },
    {
      path: `/workflows/${id}/regression-cases/from-flag`,
      body: { flagId: id },
    },
    { path: `/workflows/${id}/regression-cases/${id}/archive`, body: {} },
  ]
  const services = [
    executions.replayStep,
    regressionRuns.trigger,
    regressionCases.createFromStep,
    regressionCases.createFromFlag,
    regressionCases.archive,
  ]
  beforeAll(async () => {
    const seeded = await seedAuthorizationWorkspace('Diagnostic policy', key)
    workspaceId = seeded.workspaceId
    adminId = seeded.adminId
    memberId = seeded.memberId
    const moduleRef = await Test.createTestingModule({
      controllers: [
        ExecutionsController,
        RegressionRunsController,
        RegressionCasesController,
      ],
      providers: [
        { provide: ExecutionsService, useValue: executions },
        { provide: RegressionRunsService, useValue: regressionRuns },
        { provide: RegressionCasesService, useValue: regressionCases },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestExpressApplication<Server>>()
    app.use(testUserSession(workspaceId))
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
    await deleteAuthorizationWorkspace({ workspaceId, adminId, memberId })
    await pool.end()
  })
  it('refuses members and workspace API keys before any diagnostic work is queued', async () => {
    const server = app.getHttpServer()
    for (const auth of [
      { 'x-test-user': memberId },
      { Authorization: `Bearer ${key.rawKey}` },
    ]) {
      for (const route of routes) {
        await request(server)
          .post(route.path)
          .set(auth)
          .send(route.body)
          .expect(403)
      }
      await request(server)
        .get(`/workflows/${id}/regression-runs`)
        .set(auth)
        .expect(200)
    }
    for (const service of services) expect(service).not.toHaveBeenCalled()
  })
  it('lets an admin session through to the service', async () => {
    const server = app.getHttpServer()
    for (const route of routes) {
      await request(server)
        .post(route.path)
        .set('x-test-user', adminId)
        .send(route.body)
        .expect(404)
    }
    for (const service of services) expect(service).toHaveBeenCalledTimes(1)
  })
})
