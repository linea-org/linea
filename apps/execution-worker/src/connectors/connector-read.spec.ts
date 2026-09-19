import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type Server } from "node:http"
import {
  ConnectorGateway,
  connectorOperationRegistry,
  type ConnectorOperationRegistry,
} from "@linea/connectors"
import { db, encryptCredential, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { AiNode } from "../graph/nodes/ai.node"
import { ApprovalNode } from "../graph/nodes/approval.node"
import { BranchNode } from "../graph/nodes/branch.node"
import { ConnectorNode } from "../graph/nodes/connector.node"
import { DatetimeNode } from "../graph/nodes/datetime.node"
import { FilterNode } from "../graph/nodes/filter.node"
import { HttpNode } from "../graph/nodes/http.node"
import { MemoryNode } from "../graph/nodes/memory.node"
import { MergeNode } from "../graph/nodes/merge.node"
import { TransformNode } from "../graph/nodes/transform.node"
import { VariablesNode } from "../graph/nodes/variables.node"
import { WaitNode } from "../graph/nodes/wait.node"
import { RunLeaseService } from "../runs/run-lease.service"
import { RunsService } from "../runs/runs.service"

type Fixture = {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  connectionId: string
  executionId: string
  accessToken: string
}

type Provider = {
  server: Server
  baseUrl: string
  requests: Array<{ authorization: string | undefined; path: string }>
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname
}

async function startProvider(): Promise<Provider> {
  const requests: Provider["requests"] = []
  const server = createServer((request, response) => {
    const path = requestPath(request)
    requests.push({
      authorization: request.headers.authorization,
      path,
    })
    const token = request.headers.authorization?.replace(/^Bearer /, "")
    if (!token?.startsWith("connector-secret-")) {
      response.writeHead(401).end()
      return
    }
    const resourceId = decodeURIComponent(path.replace("/resources/", ""))
    if (resourceId === "provider-failure") {
      response
        .writeHead(502, { "content-type": "application/json" })
        .end(JSON.stringify({ error: `private provider failure ${token}` }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        resourceId,
        label: `Resource ${resourceId}`,
        accessToken: token,
        rawProviderField: "must not enter workflow state",
      })
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Deterministic provider did not bind a TCP port")
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
  }
}

function graph(operation: string): WorkflowGraph {
  return {
    version: 1,
    trigger: { type: "api" },
    entryNodeId: "read",
    nodes: [
      { id: "read", type: "connector", config: { operation } },
      { id: "end", type: "end", config: {} },
    ],
    edges: [{ from: "read", to: "end" }],
  }
}

async function createConnection(input: {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  providerAccountId: string
  credentialAccountId?: string
  scopes?: string[]
}): Promise<{ id: string; accessToken: string }> {
  const id = randomUUID()
  const accessToken = `connector-secret-${randomUUID()}`
  const credentialEncrypted = encryptCredential(
    JSON.stringify({
      accountId: input.credentialAccountId ?? input.providerAccountId,
      accountLabel: "Connector test account",
      accessToken,
      refreshToken: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      externalSubjectId: input.externalSubjectId,
      recordId: id,
      provider: "test",
    }
  )
  await db.insert(schema.connections).values({
    id,
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    externalSubjectId: input.externalSubjectId,
    provider: "test",
    providerAccountId: input.providerAccountId,
    accountLabel: "Connector test account",
    status: "active",
    scopes: input.scopes ?? ["read:resources"],
    credentialEncrypted,
  })
  return { id, accessToken }
}

async function createFixture(
  input: {
    operation?: string
    operationInput?: unknown
    connectionId?: string
    credentialAccountId?: string
  } = {}
): Promise<Fixture> {
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: "Connector read test",
      slug: `connector-read-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const [application] = await db
    .insert(schema.applications)
    .values({
      workspaceId: workspace.id,
      environment: "dev",
      displayName: "Connector read application",
      allowedBrowserOrigins: ["http://127.0.0.1:4173"],
      allowedRedirectOrigins: ["http://127.0.0.1:4173"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: `connector-read-${suffix}`,
      oidcAudience: `connector-read-${suffix}`,
      oidcJwksUrl: "https://identity.example.com/jwks",
      connectorAccessPolicy: {
        providers: [
          {
            provider: "test",
            actionFamilies: ["test"],
            maxScopes: ["read:resources"],
          },
        ],
      },
    })
    .returning()
  const [subject] = await db
    .insert(schema.externalSubjects)
    .values({
      workspaceId: workspace.id,
      issuer: application.oidcIssuer,
      issuerSubject: `connector-subject-${suffix}`,
      status: "verified",
      verifiedAt: new Date(),
    })
    .returning()
  await db.insert(schema.externalSubjectApplications).values({
    workspaceId: workspace.id,
    applicationId: application.id,
    externalSubjectId: subject.id,
  })
  const connection = await createConnection({
    workspaceId: workspace.id,
    applicationId: application.id,
    externalSubjectId: subject.id,
    providerAccountId: "provider-account-one",
    credentialAccountId: input.credentialAccountId,
  })
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: workspace.id,
    name: "Connector read workflow",
    slug: `connector-read-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: graph(input.operation ?? "deterministic.read"),
    contentHash: suffix,
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: workspace.id,
    applicationId: application.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    externalSubjectRecordId: subject.id,
    externalSubjectId: subject.issuerSubject ?? undefined,
    trigger: "api",
    triggerPayload: {
      connectionId: input.connectionId ?? connection.id,
      input: input.operationInput ?? { resourceId: "record-one" },
    },
  })
  return {
    workspaceId: workspace.id,
    applicationId: application.id,
    externalSubjectId: subject.id,
    connectionId: connection.id,
    executionId: execution.id,
    accessToken: connection.accessToken,
  }
}

function runs(operations: ConnectorOperationRegistry): RunsService {
  const gateway = {
    executeRead(input: Parameters<ConnectorGateway["executeRead"]>[0]) {
      return new ConnectorGateway(db, operations).executeRead(input)
    },
  }
  const checkpoints = new CheckpointsService()
  const interpreter = new InterpreterService(
    checkpoints,
    new HttpNode(),
    new TransformNode(),
    new BranchNode(),
    new AiNode(),
    new ApprovalNode(),
    new MemoryNode(),
    new WaitNode(),
    new DatetimeNode(),
    new FilterNode(),
    new MergeNode(),
    new VariablesNode(),
    new ConnectorNode(gateway)
  )
  return new RunsService(checkpoints, interpreter, new RunLeaseService())
}

async function execute(
  fixture: Fixture,
  operations: ConnectorOperationRegistry = connectorOperationRegistry
) {
  await runs(operations).execute(fixture.executionId)
  const execution = await repositories.execution.getExecutionById(
    db,
    fixture.executionId
  )
  const steps = await repositories.checkpoint.getStepsForExecution(
    db,
    fixture.executionId
  )
  return { execution, steps }
}

async function removeWorkspace(workspaceId: string): Promise<void> {
  await pool.query("DELETE FROM organizations WHERE id = $1", [workspaceId])
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item
  )
}

describe("classified Connector reads", () => {
  let provider: Provider

  beforeAll(async () => {
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "connector-test-v1"
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      "connector-test-v1": Buffer.alloc(32, 9).toString("base64"),
    })
    provider = await startProvider()
    process.env.DETERMINISTIC_CONNECTOR_BASE_URL = provider.baseUrl
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      provider.server.close((error) => (error ? reject(error) : resolve()))
    })
    await pool.end()
    delete process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY
    delete process.env.CONNECTION_CREDENTIAL_KEYS
    delete process.env.DETERMINISTIC_CONNECTOR_BASE_URL
  })

  it("returns only the bounded normalized result through real execution state", async () => {
    const fixture = await createFixture({})
    try {
      const result = await execute(fixture)
      expect(result.execution?.status).toBe("succeeded")
      expect(result.steps.map(({ output }) => output)).toEqual([
        { resourceId: "record-one", label: "Resource record-one" },
        { resourceId: "record-one", label: "Resource record-one" },
      ])
      expect(provider.requests.at(-1)).toEqual({
        authorization: `Bearer ${fixture.accessToken}`,
        path: "/resources/record-one",
      })
      const checkpoints = await db.query.checkpoints.findMany({
        where: { executionId: fixture.executionId },
      })
      const outbox = await db.query.outboxMessages.findMany({
        where: { workspaceId: fixture.workspaceId },
      })
      const workflowState = serialize({
        execution: result.execution,
        steps: result.steps.map(({ input, output, error }) => ({
          input,
          output,
          error,
        })),
        checkpoints,
        outbox: outbox.map(({ payload, lastError }) => ({
          payload,
          lastError,
        })),
      })
      expect(workflowState).not.toContain(fixture.accessToken)
      expect(workflowState).not.toContain("rawProviderField")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  it("rejects a Connection from another workspace", async () => {
    const foreign = await createFixture({})
    const fixture = await createFixture({ connectionId: foreign.connectionId })
    try {
      expect((await execute(fixture)).execution?.status).toBe("failed")
    } finally {
      await removeWorkspace(fixture.workspaceId)
      await removeWorkspace(foreign.workspaceId)
    }
  })

  it("rejects a Connection from another Application", async () => {
    const fixture = await createFixture({})
    try {
      const [application] = await db
        .insert(schema.applications)
        .values({
          workspaceId: fixture.workspaceId,
          environment: "dev",
          displayName: "Other application",
          allowedBrowserOrigins: ["http://127.0.0.1:4174"],
          allowedRedirectOrigins: ["http://127.0.0.1:4174"],
          oidcIssuer: "https://identity.example.com",
          oidcClientId: randomUUID(),
          oidcAudience: randomUUID(),
          oidcJwksUrl: "https://identity.example.com/jwks",
          connectorAccessPolicy: {
            providers: [
              {
                provider: "test",
                actionFamilies: ["test"],
                maxScopes: ["read:resources"],
              },
            ],
          },
        })
        .returning()
      await db.insert(schema.externalSubjectApplications).values({
        workspaceId: fixture.workspaceId,
        applicationId: application.id,
        externalSubjectId: fixture.externalSubjectId,
      })
      const foreign = await createConnection({
        workspaceId: fixture.workspaceId,
        applicationId: application.id,
        externalSubjectId: fixture.externalSubjectId,
        providerAccountId: "other-application-account",
      })
      await pool.query(
        "UPDATE executions SET trigger_payload = $1 WHERE id = $2",
        [
          JSON.stringify({
            connectionId: foreign.id,
            input: { resourceId: "record-one" },
          }),
          fixture.executionId,
        ]
      )
      expect((await execute(fixture)).execution?.status).toBe("failed")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  it("rejects a Connection from another External Subject", async () => {
    const fixture = await createFixture({})
    try {
      const [subject] = await db
        .insert(schema.externalSubjects)
        .values({
          workspaceId: fixture.workspaceId,
          issuer: "https://identity.example.com",
          issuerSubject: randomUUID(),
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      await db.insert(schema.externalSubjectApplications).values({
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: subject.id,
      })
      const foreign = await createConnection({
        workspaceId: fixture.workspaceId,
        applicationId: fixture.applicationId,
        externalSubjectId: subject.id,
        providerAccountId: "other-subject-account",
      })
      await pool.query(
        "UPDATE executions SET trigger_payload = $1 WHERE id = $2",
        [
          JSON.stringify({
            connectionId: foreign.id,
            input: { resourceId: "record-one" },
          }),
          fixture.executionId,
        ]
      )
      expect((await execute(fixture)).execution?.status).toBe("failed")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  it.each([
    "application disabled",
    "subject disabled",
    "Connection inactive",
    "scope missing",
    "provider policy missing",
    "action family denied",
    "policy scope denied",
  ])("fails closed when %s", async (boundary) => {
    const fixture = await createFixture({})
    try {
      if (boundary === "application disabled") {
        await pool.query(
          "UPDATE applications SET enabled = false WHERE id = $1",
          [fixture.applicationId]
        )
      }
      if (boundary === "subject disabled") {
        await pool.query(
          "UPDATE external_subjects SET status = 'disabled', disabled_at = NOW() WHERE id = $1",
          [fixture.externalSubjectId]
        )
      }
      if (boundary === "Connection inactive") {
        await pool.query(
          "UPDATE connections SET status = 'reauthorization_required', credential_encrypted = NULL WHERE id = $1",
          [fixture.connectionId]
        )
      }
      if (boundary === "scope missing") {
        await pool.query("UPDATE connections SET scopes = $1 WHERE id = $2", [
          ["profile"],
          fixture.connectionId,
        ])
      }
      if (boundary === "provider policy missing") {
        await pool.query(
          "UPDATE applications SET connector_access_policy = $1 WHERE id = $2",
          [JSON.stringify({ providers: [] }), fixture.applicationId]
        )
      }
      if (boundary === "action family denied") {
        await pool.query(
          "UPDATE applications SET connector_access_policy = $1 WHERE id = $2",
          [
            JSON.stringify({
              providers: [
                {
                  provider: "test",
                  actionFamilies: [],
                  maxScopes: ["read:resources"],
                },
              ],
            }),
            fixture.applicationId,
          ]
        )
      }
      if (boundary === "policy scope denied") {
        await pool.query(
          "UPDATE applications SET connector_access_policy = $1 WHERE id = $2",
          [
            JSON.stringify({
              providers: [
                {
                  provider: "test",
                  actionFamilies: ["test"],
                  maxScopes: ["profile"],
                },
              ],
            }),
            fixture.applicationId,
          ]
        )
      }
      expect((await execute(fixture)).execution?.status).toBe("failed")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  it("rejects provider-account credential substitution", async () => {
    const fixture = await createFixture({
      credentialAccountId: "different-provider-account",
    })
    try {
      expect((await execute(fixture)).execution?.status).toBe("failed")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  it("fails closed for unknown and unclassified operations", async () => {
    const unknown = await createFixture({ operation: "unknown.read" })
    const unclassified = await createFixture({
      operation: "unclassified.read",
    })
    const unclassifiedRegistry = {
      "unclassified.read": {
        id: "unclassified.read",
        provider: "test",
        actionFamily: "test",
        requiredScopes: ["read:resources"],
        providerErrorMessage: "Connector provider request failed",
        inputSchema: { parse: (value: unknown) => value },
        outputSchema: { parse: (value: unknown) => value },
        execute: () => Promise.resolve({ unsafe: true }),
      },
    }
    try {
      expect((await execute(unknown)).execution?.status).toBe("failed")
      expect(
        (await execute(unclassified, unclassifiedRegistry)).execution?.status
      ).toBe("failed")
    } finally {
      await removeWorkspace(unknown.workspaceId)
      await removeWorkspace(unclassified.workspaceId)
    }
  })

  it("rejects operation input outside the registered schema", async () => {
    const fixture = await createFixture({
      operationInput: { resourceId: "x".repeat(65) },
    })
    try {
      const result = await execute(fixture)
      expect(result.execution?.status).toBe("failed")
      expect(result.steps[0]?.error?.message).toBe("Connector input is invalid")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  it("redacts provider errors and credentials from persisted and emitted state", async () => {
    const fixture = await createFixture({
      operationInput: { resourceId: "provider-failure" },
    })
    const consoleError = jest.spyOn(console, "error").mockImplementation()
    const consoleLog = jest.spyOn(console, "log").mockImplementation()
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation()
    try {
      const result = await execute(fixture)
      expect(result.execution?.status).toBe("failed")
      expect(result.execution?.error?.message).toBe(
        "Connector provider request failed"
      )
      const checkpoints = await db.query.checkpoints.findMany({
        where: { executionId: fixture.executionId },
      })
      const outbox = await db.query.outboxMessages.findMany({
        where: { workspaceId: fixture.workspaceId },
      })
      const persisted = serialize({
        execution: result.execution,
        steps: result.steps.map(({ input, output, error }) => ({
          input,
          output,
          error,
        })),
        checkpoints,
        outbox: outbox.map(({ payload, lastError }) => ({
          payload,
          lastError,
        })),
        logs: [
          ...consoleError.mock.calls,
          ...consoleLog.mock.calls,
          ...consoleWarn.mock.calls,
        ],
      })
      expect(persisted).not.toContain(fixture.accessToken)
      expect(persisted).not.toContain("private provider failure")
      expect(persisted).not.toContain("rawProviderField")
    } finally {
      consoleError.mockRestore()
      consoleLog.mockRestore()
      consoleWarn.mockRestore()
      await removeWorkspace(fixture.workspaceId)
    }
  })
})
