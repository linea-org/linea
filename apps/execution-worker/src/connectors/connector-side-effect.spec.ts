import { createTestExecution } from "@linealabs/db/testing"
import { fixtureIssuer } from "@linealabs/db/testing"
import { configureTestEnvironment } from "@linealabs/db/testing"
import { getTestApplicationId } from "@linealabs/db/testing"
import "dotenv/config"
import { randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import {
  ConnectorGateway,
  ConnectorGatewayError,
  connectorOperationRegistry,
  deterministicSideEffectOperation,
  type ConnectorReadCredential,
  type ConnectorSideEffectOperation,
} from "@linealabs/connectors"
import {
  db,
  encryptCredential,
  pool,
  repositories,
  schema,
} from "@linealabs/db"
import type { WorkflowGraph } from "@linealabs/runtime"
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
import { removeWorkspace } from "../runs/agent-execution.fixture"
import { AgentExecutionService } from "../runs/agent-execution.service"
import { ConnectorGatewayService } from "./connector-gateway.service"
import { RunsService } from "../runs/runs.service"

type ProviderRequest = {
  authorization: string | undefined
  body: unknown
  idempotencyKey: string | undefined
  ifMatch: string | undefined
  method: string | undefined
  path: string
}

type Provider = {
  server: Server
  baseUrl: string
  requests: ProviderRequest[]
  effects: Map<string, number>
}

type Fixture = {
  workspaceId: string
  environmentId: string
  environmentKeyId: string
  externalSubjectId: string
  endUserSessionId: string
  connectionId: string
  accessToken: string
  executionId: string
  executionClaimId: string
  input: {
    resourceId: string
    value: string
    secret: string
    expectedVersion: string
  }
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: unknown[] = []
  for await (const chunk of request) chunks.push(chunk)
  const text = chunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk
      if (chunk instanceof Uint8Array) {
        return Buffer.from(chunk).toString("utf8")
      }
      throw new Error("Provider request body is not binary data")
    })
    .join("")
  return text ? JSON.parse(text) : undefined
}

function singleHeader(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) throw new Error("Provider header must be singular")
  return value
}

function respondToProvider(
  request: IncomingMessage,
  response: ServerResponse,
  provider: Pick<Provider, "requests" | "effects">,
  idempotentResults: Map<string, unknown>,
  body: unknown
): void {
  const path = requestPath(request)
  provider.requests.push({
    authorization: request.headers.authorization,
    body,
    idempotencyKey: singleHeader(request.headers["idempotency-key"]),
    ifMatch: singleHeader(request.headers["if-match"]),
    method: request.method,
    path,
  })
  const token = request.headers.authorization?.replace(/^Bearer /, "")
  if (!token?.startsWith("connector-secret-")) {
    response.writeHead(401).end()
    return
  }
  const resourceId = decodeURIComponent(path.replace("/resources/", ""))
  if (request.method === "GET" && resourceId.endsWith("/version")) {
    const id = resourceId.slice(0, -"/version".length)
    response.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        version: id === "stale" ? "version-two" : "version-one",
      })
    )
    return
  }
  if (resourceId === "stale") {
    response.writeHead(412).end()
    return
  }
  if (resourceId === "outcome-unknown") {
    response.writeHead(504).end()
    return
  }
  if (resourceId === "provider-failure") {
    response
      .writeHead(502, { "content-type": "application/json" })
      .end(JSON.stringify({ error: `private provider failure ${token}` }))
    return
  }
  const result = {
    resourceId,
    value: (body as { value: string }).value,
    version: "version-two",
    accessToken: token,
    rawProviderField: "must not enter workflow state",
  }
  if (resourceId === "response-lost" || resourceId === "lease-expired") {
    const idempotencyKey = singleHeader(request.headers["idempotency-key"])
    if (!idempotencyKey) throw new Error("Provider idempotency key is missing")
    const previous = idempotentResults.get(idempotencyKey)
    if (previous) {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(previous))
      return
    }
    idempotentResults.set(idempotencyKey, result)
    provider.effects.set(
      resourceId,
      (provider.effects.get(resourceId) ?? 0) + 1
    )
    if (resourceId === "response-lost") response.destroy()
    else {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(result))
    }
    return
  }
  provider.effects.set(resourceId, (provider.effects.get(resourceId) ?? 0) + 1)
  response
    .writeHead(200, { "content-type": "application/json" })
    .end(JSON.stringify(result))
}

async function startProvider(): Promise<Provider> {
  const requests: ProviderRequest[] = []
  const effects = new Map<string, number>()
  const idempotentResults = new Map<string, unknown>()
  const server = createServer((request, response) => {
    void requestBody(request)
      .then((body) =>
        respondToProvider(
          request,
          response,
          { requests, effects },
          idempotentResults,
          body
        )
      )
      .catch((error: unknown) =>
        response.destroy(
          error instanceof Error ? error : new Error(String(error))
        )
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
    effects,
  }
}

function graph(): WorkflowGraph {
  return {
    version: 1,
    trigger: { type: "api" },
    entryNodeId: "action",
    nodes: [
      {
        id: "action",
        type: "connector",
        config: { operation: "deterministic.update" },
      },
      { id: "end", type: "end", config: {} },
    ],
    edges: [{ from: "action", to: "end" }],
  }
}

async function createFixture(
  resourceId = "record-one",
  start = true
): Promise<Fixture> {
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: "Connector side effect test",
      slug: `connector-side-effect-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const environment = await configureTestEnvironment(db, {
    applicationId: await getTestApplicationId(db, workspace.id),
    workspaceId: workspace.id,
    environment: "dev",
    displayName: "Connector side effect environment",
    allowedBrowserOrigins: ["http://127.0.0.1:4173"],
    allowedRedirectOrigins: ["http://127.0.0.1:4173"],
    oidcIssuer: "https://identity.example.com",
    oidcClientId: `connector-side-effect-${suffix}`,
    oidcAudience: `connector-side-effect-${suffix}`,
    oidcJwksUrl: "https://identity.example.com/jwks",
    connectorAccessPolicy: {
      providers: [
        {
          provider: "test",
          actionFamilies: ["test"],
          maxScopes: ["write:resources"],
        },
      ],
    },
  })
  const [subject] = await db
    .insert(schema.externalSubjects)
    .values({
      workspaceId: workspace.id,
      issuer: fixtureIssuer(environment),
      issuerSubject: `connector-subject-${suffix}`,
      status: "verified",
      verifiedAt: new Date(),
    })
    .returning()
  const [environmentKey] = await db
    .insert(schema.environmentKeys)
    .values({
      workspaceId: workspace.id,
      environmentId: environment.id,
      name: "Connector race test",
      scopes: ["executions:cancel"],
      hashedKey: `hashed-${suffix}`,
      keyPrefix: `prefix-${suffix}`,
    })
    .returning()
  await db.insert(schema.externalSubjectEnvironments).values({
    workspaceId: workspace.id,
    environmentId: environment.id,
    externalSubjectId: subject.id,
  })
  const connectionId = randomUUID()
  const accessToken = `connector-secret-${randomUUID()}`
  await db.insert(schema.connections).values({
    id: connectionId,
    workspaceId: workspace.id,
    environmentId: environment.id,
    externalSubjectId: subject.id,
    provider: "test",
    providerAccountId: "provider-account-one",
    accountLabel: "Connector test account",
    status: "active",
    scopes: ["write:resources"],
    credentialEncrypted: encryptCredential(
      JSON.stringify({
        accountId: "provider-account-one",
        accessToken,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      {
        workspaceId: workspace.id,
        environmentId: environment.id,
        externalSubjectId: subject.id,
        recordId: connectionId,
        provider: "test",
      }
    ),
  })
  const [session] = await db
    .insert(schema.endUserSessions)
    .values({
      workspaceId: workspace.id,
      environmentId: environment.id,
      externalSubjectId: subject.id,
      tokenHash: `token-${suffix}`,
      proofJkt: `proof-${suffix}`,
      nonceHash: `nonce-${suffix}`,
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    applicationId: await getTestApplicationId(db, workspace.id),
    workspaceId: workspace.id,
    name: "Connector side effect workflow",
    slug: `connector-side-effect-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: graph(),
    contentHash: suffix,
  })
  const execution = await createTestExecution(db, {
    workspaceId: workspace.id,
    environmentId: environment.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    externalSubjectRecordId: subject.id,
    externalSubjectId: subject.issuerSubject ?? undefined,
    trigger: "api",
    triggerPayload: {
      connectionId,
      input: {
        resourceId,
        value: " <new value> ",
        secret: `private-${suffix}`,
        expectedVersion: "version-one",
      },
    },
  })
  const executionClaimId = `side-effect-test:${suffix}`
  if (start) {
    const started = await repositories.execution.startExecution(
      db,
      execution.id,
      executionClaimId,
      new Date(Date.now() + 60_000)
    )
    if (!started) throw new Error("Fixture Execution did not start")
  }
  return {
    workspaceId: workspace.id,
    environmentId: environment.id,
    environmentKeyId: environmentKey.id,
    externalSubjectId: subject.id,
    endUserSessionId: session.id,
    connectionId,
    accessToken,
    executionId: execution.id,
    executionClaimId,
    input: {
      resourceId,
      value: " <new value> ",
      secret: `private-${suffix}`,
      expectedVersion: "version-one",
    },
  }
}

function runs(): RunsService {
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
    new ConnectorNode()
  )
  return new RunsService(
    checkpoints,
    interpreter,
    new RunLeaseService(),
    new AgentExecutionService(checkpoints, new ConnectorGatewayService())
  )
}

function invoke(
  fixture: Fixture,
  operationInput: unknown = fixture.input,
  invocationIdempotencyKey = `${fixture.executionId}:action`
) {
  return new ConnectorGateway(db, connectorOperationRegistry).execute({
    executionId: fixture.executionId,
    workspaceId: fixture.workspaceId,
    nodeId: "action",
    connectionId: fixture.connectionId,
    operationId: "deterministic.update",
    operationInput,
    invocationIdempotencyKey,
    executionClaimId: fixture.executionClaimId,
  })
}

async function consent(fixture: Fixture) {
  const view = await repositories.actionIntent.getActionIntentConsent(db, {
    workspaceId: fixture.workspaceId,
    executionId: fixture.executionId,
    nodeId: "action",
    invocationIdempotencyKey: `${fixture.executionId}:action`,
  })
  if (!view) throw new Error("Fixture Action Intent was not created")
  return view
}

async function decide(
  fixture: Fixture,
  outcome: "approved" | "rejected"
): Promise<void> {
  const view = await consent(fixture)
  const result =
    await repositories.approvalRequest.decideExternalApprovalRequest(db, {
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environmentId,
      externalSubjectId: fixture.externalSubjectId,
      endUserSessionId: fixture.endUserSessionId,
      approvalRequestId: view.approvalRequest.id,
      outcome,
      idempotencyKey: randomUUID(),
      now: new Date(),
    })
  if (result.outcome !== "decided") {
    throw new Error(`Fixture Decision failed: ${result.outcome}`)
  }
}

async function revoke(fixture: Fixture) {
  const connection = await repositories.connection.getConnection(
    db,
    {
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environmentId,
      externalSubjectId: fixture.externalSubjectId,
    },
    fixture.connectionId
  )
  if (!connection) throw new Error("Fixture Connection was not found")
  const deliveryId = randomUUID()
  return repositories.connection.revokeConnection(
    db,
    {
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environmentId,
      externalSubjectId: fixture.externalSubjectId,
    },
    fixture.connectionId,
    {
      expectedCredentialVersion: connection.credentialVersion,
      deliveryId,
      revocationCredentialEncrypted: encryptCredential("revocation", {
        workspaceId: fixture.workspaceId,
        environmentId: fixture.environmentId,
        externalSubjectId: fixture.externalSubjectId,
        recordId: deliveryId,
        provider: "test:revocation",
      }),
      actorEndUserSessionId: fixture.endUserSessionId,
      expiresAt: new Date(Date.now() + 60_000),
      now: new Date(),
    }
  )
}

function cancelExecution(fixture: Fixture) {
  return repositories.publicRuntime.cancelPublicExecution(
    db,
    fixture.workspaceId,
    fixture.environmentId,
    fixture.executionId,
    {
      actor: { kind: "environment_key", id: fixture.environmentKeyId },
      key: randomUUID(),
      requestHash: repositories.publicIdempotency.hashPublicRequest({
        executionId: fixture.executionId,
      }),
    }
  )
}

async function attachParent(fixture: Fixture) {
  const parent = { ...fixture }
  const agent = await repositories.agent.createAgent(db, {
    workspaceId: fixture.workspaceId,
    applicationId: await getTestApplicationId(db, fixture.workspaceId),
    name: "Nested Agent",
    slug: "nested-agent",
  })
  if (!agent) throw new Error("Missing Agent")
  const contract = await repositories.agentContract.createAgentContractRevision(
    db,
    fixture.workspaceId,
    agent.id,
    {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    }
  )
  if (contract.outcome !== "created") throw new Error(contract.outcome)
  const version = await repositories.agent.createAgentVersion(
    db,
    fixture.workspaceId,
    agent.id,
    {
      agentContractRevisionId: contract.revision.id,
      definition: {
        version: 1,
        instructions: "Update",
        model: "gpt-5",
        tools: [],
        maxIterations: 2,
      },
    }
  )
  if (version.outcome !== "created") throw new Error(version.outcome)
  await repositories.agent.publishAgentVersion(
    db,
    fixture.workspaceId,
    agent.id,
    version.version.id
  )
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    fixture.workspaceId,
    fixture.environmentId,
    agent.id,
    {
      agentVersionId: version.version.id,
      agentContractRevisionId: contract.revision.id,
      enabled: true,
    }
  )
  const child =
    await repositories.nestedAgentExecution.startNestedAgentExecution(db, {
      workspaceId: fixture.workspaceId,
      parentExecutionId: parent.executionId,
      nodeId: "agent",
      agentId: agent.id,
      agentContractRevisionId: contract.revision.id,
      input: {},
    })
  if (child.outcome !== "created") throw new Error(child.outcome)
  fixture.executionId = child.execution.id
  await repositories.execution.startExecution(
    db,
    fixture.executionId,
    fixture.executionClaimId,
    new Date(Date.now() + 60_000)
  )
  await repositories.pauseClaim.claimPause(db, {
    workspaceId: fixture.workspaceId,
    executionId: parent.executionId,
    leasedBy: parent.executionClaimId,
    steps: [{ nodeId: "agent", kind: "agent" }],
  })
  return parent
}

async function waitForLockWait(holderPid: number): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blocked = await pool.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
      [holderPid]
    )
    if (blocked.rows.length > 0) return blocked.rows[0].pid
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Nothing blocked behind backend ${holderPid}`)
}

describe("exact Action Intent consent", () => {
  let provider: Provider
  beforeAll(async () => {
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "connector-test-v1"
    process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
      "connector-test-v1": Buffer.alloc(32, 9).toString("base64"),
    })
    provider = await startProvider()
    process.env.DETERMINISTIC_CONNECTOR_BASE_URL = provider.baseUrl
  })
  afterEach(() => {
    provider.requests.length = 0
    provider.effects.clear()
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
  it("cascades parent cancellation to child consent, audit and events and blocks late provider dispatch", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      await invoke(fixture)
      expect(
        await repositories.pauseClaim.claimPause(db, {
          workspaceId: fixture.workspaceId,
          executionId: fixture.executionId,
          leasedBy: fixture.executionClaimId,
          steps: [{ nodeId: "action", kind: "approval" }],
        })
      ).toEqual({ outcome: "paused" })
      const before = await consent(fixture)
      expect((await cancelExecution(parent)).outcome).toBe("cancelled")
      for (const id of [parent.executionId, fixture.executionId]) {
        expect(
          (await repositories.execution.getExecutionById(db, id))?.status
        ).toBe("cancelled")
      }
      const after = await consent(fixture)
      expect(after.intent.status).toBe("cancelled")
      expect(after.approvalRequest.status).toBe("cancelled")
      await expect(decide(fixture, "approved")).rejects.toThrow("cancelled")
      await expect(invoke(fixture)).rejects.toBeInstanceOf(
        ConnectorGatewayError
      )
      expect(provider.requests).toHaveLength(0)
      const audits = await pool.query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE resource_id = $1",
        [before.approvalRequest.id]
      )
      expect(
        audits.rows.filter((row) => row.action === "approval_request.cancelled")
      ).toHaveLength(1)
      const events = await pool.query(
        "SELECT payload FROM outbox_messages WHERE workspace_id = $1 AND event_type = 'approval_request.cancelled'",
        [fixture.workspaceId]
      )
      expect(events.rows).toHaveLength(1)
      expect(JSON.stringify(events.rows)).toContain(before.approvalRequest.id)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("refuses the whole tree cancellation when a child intent is executing", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      await invoke(fixture)
      await decide(fixture, "approved")
      const view = await consent(fixture)
      expect(
        (
          await repositories.actionIntent.claimApprovedActionIntent(db, {
            actionIntentId: view.intent.id,
            executionClaimId: fixture.executionClaimId,
            provider: "test",
            actionFamily: "test",
            requiredScopes: ["write:resources"],
            now: new Date(),
          })
        )?.outcome
      ).toBe("claimed")
      const root = await repositories.execution.getExecutionById(
        db,
        parent.executionId
      )
      if (!root?.workflowId) throw new Error("Missing Workflow")
      const request = await repositories.approvalRequest.createApprovalRequest(
        db,
        {
          workspaceId: fixture.workspaceId,
          environmentId: fixture.environmentId,
          workflowId: root.workflowId,
          executionId: root.id,
          nodeId: "root-approval",
          audience: "external_subject",
          externalSubjectId: fixture.externalSubjectId,
          display: { title: "Root" },
        }
      )
      expect(request).toBeDefined()
      expect((await cancelExecution(parent)).outcome).toBe(
        "execution_not_cancellable"
      )
      expect(
        (await repositories.execution.getExecutionById(db, root.id))?.status
      ).toBe("paused")
      expect(
        (await repositories.execution.getExecutionById(db, fixture.executionId))
          ?.status
      ).toBe("running")
      expect((await consent(fixture)).intent.status).toBe("executing")
      const pending = await pool.query<{ status: string }>(
        "SELECT status FROM approval_requests WHERE id = $1",
        [request?.id]
      )
      expect(pending.rows[0].status).toBe("pending")
      const cancelled = await pool.query(
        "SELECT id FROM audit_logs WHERE workspace_id = $1 AND action IN ('execution.cancelled', 'approval_request.cancelled')",
        [fixture.workspaceId]
      )
      expect(cancelled.rows).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("rechecks terminal parent authority at child start, decision, claim and dispatch", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      await invoke(fixture)
      await pool.query(
        "UPDATE executions SET status = 'cancelled' WHERE id = $1",
        [parent.executionId]
      )
      await expect(decide(fixture, "approved")).rejects.toThrow("cancelled")
      await pool.query(
        "UPDATE executions SET status = 'paused' WHERE id = $1",
        [parent.executionId]
      )
      await decide(fixture, "approved")
      const view = await consent(fixture)
      const claim = {
        actionIntentId: view.intent.id,
        executionClaimId: fixture.executionClaimId,
        provider: "test",
        actionFamily: "test",
        requiredScopes: ["write:resources"],
        now: new Date(),
      }
      expect(
        (await repositories.actionIntent.claimApprovedActionIntent(db, claim))
          ?.outcome
      ).toBe("claimed")
      await pool.query(
        "UPDATE executions SET status = 'cancelled' WHERE id = $1",
        [parent.executionId]
      )
      expect(
        await repositories.actionIntent.beginActionIntentDispatch(db, claim)
      ).toBeUndefined()
      await pool.query(
        "UPDATE executions SET status = 'queued' WHERE id = $1",
        [fixture.executionId]
      )
      expect(
        await repositories.execution.startExecution(
          db,
          fixture.executionId,
          "late",
          new Date(Date.now() + 60_000)
        )
      ).toBeUndefined()
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("serializes parent cancellation against a child's approving Decision", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      await invoke(fixture)
      const results = await Promise.allSettled([
        cancelExecution(parent),
        decide(fixture, "approved"),
      ])
      expect(results[0]).toMatchObject({
        status: "fulfilled",
        value: { outcome: "cancelled" },
      })
      expect((await consent(fixture)).intent.status).toBe("cancelled")
      expect(
        (await repositories.execution.getExecutionById(db, fixture.executionId))
          ?.status
      ).toBe("cancelled")
      await expect(invoke(fixture)).rejects.toBeInstanceOf(
        ConnectorGatewayError
      )
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("refuses a ready child intent claim when its parent is already cancelled", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      await invoke(fixture)
      await decide(fixture, "approved")
      const view = await consent(fixture)
      await pool.query(
        "UPDATE executions SET status = 'cancelled' WHERE id = $1",
        [parent.executionId]
      )
      expect(
        (
          await repositories.actionIntent.claimApprovedActionIntent(db, {
            actionIntentId: view.intent.id,
            executionClaimId: fixture.executionClaimId,
            provider: "test",
            actionFamily: "test",
            requiredScopes: ["write:resources"],
            now: new Date(),
          })
        )?.outcome
      ).toBe("cancelled")
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("serializes nested Agent creation with parent cancellation", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      const child = await repositories.execution.getExecutionById(
        db,
        fixture.executionId
      )
      if (!child?.agentId || !child.agentContractRevisionId)
        throw new Error("Missing Agent")
      await pool.query(
        "UPDATE executions SET status = 'running' WHERE id = $1",
        [parent.executionId]
      )
      const [creation, cancellation] = await Promise.all([
        repositories.nestedAgentExecution.startNestedAgentExecution(db, {
          workspaceId: fixture.workspaceId,
          parentExecutionId: parent.executionId,
          nodeId: "racing-agent",
          agentId: child.agentId,
          agentContractRevisionId: child.agentContractRevisionId,
          input: {},
        }),
        cancelExecution(parent),
      ])
      expect(cancellation.outcome).toBe("cancelled")
      expect(["created", "parent_not_active"]).toContain(creation.outcome)
      if (creation.outcome === "created") {
        expect(
          (
            await repositories.execution.getExecutionById(
              db,
              creation.execution.id
            )
          )?.status
        ).toBe("cancelled")
      }
      const live = await pool.query(
        "SELECT id FROM executions WHERE parent_execution_id = $1 AND status IN ('queued', 'running', 'paused')",
        [parent.executionId]
      )
      expect(live.rows).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it.each(["advisory", "execution"])(
    "preserves bulk %s lock order while another transaction blocks a child",
    async (stage) => {
      const fixture = await createFixture()
      const client = await pool.connect()
      let cancellation: Promise<unknown> | undefined
      try {
        const parent = await attachParent(fixture)
        const extraHex = (
          BigInt(`0x${parent.executionId.replaceAll("-", "")}`) + 1n
        )
          .toString(16)
          .padStart(32, "0")
        const extraId = [
          extraHex.slice(0, 8),
          extraHex.slice(8, 12),
          extraHex.slice(12, 16),
          extraHex.slice(16, 20),
          extraHex.slice(20),
        ].join("-")
        await pool.query(
          `INSERT INTO executions (id, workspace_id, environment_id, agent_id, agent_version_id,
        agent_contract_revision_id, external_subject_record_id, parent_execution_id, parent_node_id, trigger)
        SELECT $1, workspace_id, environment_id, agent_id, agent_version_id, agent_contract_revision_id,
        external_subject_record_id, parent_execution_id, 'second-agent', trigger FROM executions WHERE id = $2`,
          [extraId, fixture.executionId]
        )
        const [first, last] = [extraId, fixture.executionId].sort()
        await client.query("BEGIN")
        await client.query("SET LOCAL lock_timeout = '2s'")
        if (stage === "advisory") {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [`action-intent-execution:${first}`]
          )
        } else {
          await client.query(
            "SELECT id FROM executions WHERE id = $1 FOR UPDATE",
            [last]
          )
        }
        const pid = await client.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid"
        )
        cancellation = cancelExecution(parent)
        const outcome = cancellation.then(
          (value) => ({ value }),
          (error: unknown) => ({ error })
        )
        await waitForLockWait(pid.rows[0].pid)
        if (stage === "advisory") {
          const locks = await client.query<{ parent: boolean; last: boolean }>(
            "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS parent, pg_try_advisory_xact_lock(hashtextextended($2, 0)) AS last",
            [
              `action-intent-execution:${parent.executionId}`,
              `action-intent-execution:${last}`,
            ]
          )
          expect(locks.rows[0]).toEqual({ parent: false, last: true })
        }
        await client.query(
          "SELECT id FROM executions WHERE id = $1 FOR UPDATE",
          [parent.executionId]
        )
        await client.query(
          "SELECT id FROM executions WHERE id = $1 FOR UPDATE",
          [last]
        )
        await client.query("COMMIT")
        const result = await outcome
        if ("error" in result) throw result.error
        expect(result.value).toMatchObject({ outcome: "cancelled" })
        const children = await pool.query<{ status: string }>(
          "SELECT status FROM executions WHERE parent_execution_id = $1",
          [parent.executionId]
        )
        expect(children.rows).toEqual([
          { status: "cancelled" },
          { status: "cancelled" },
        ])
      } finally {
        await client.query("ROLLBACK")
        if (cancellation) await Promise.allSettled([cancellation])
        client.release()
        await removeWorkspace(fixture.workspaceId)
      }
    }
  )
  it("batches workflow Approval Request cancellation and publishes each audit/event once", async () => {
    const fixture = await createFixture()
    try {
      const parent = await attachParent(fixture)
      for (const executionId of [parent.executionId, fixture.executionId]) {
        await repositories.approvalRequest.createApprovalRequest(db, {
          workspaceId: fixture.workspaceId,
          environmentId: fixture.environmentId,
          executionId,
          nodeId: "workflow-approval",
          audience: "external_subject",
          externalSubjectId: fixture.externalSubjectId,
          display: { title: "Continue?" },
        })
      }
      const wakesBefore = await pool.query(
        "SELECT id FROM outbox_messages WHERE workspace_id = $1 AND kind = 'workflow_execution' AND payload->>'executionId' = $2",
        [fixture.workspaceId, parent.executionId]
      )
      expect((await cancelExecution(parent)).outcome).toBe("cancelled")
      const requests = await pool.query<{ status: string; version: number }>(
        "SELECT status, version FROM approval_requests WHERE workspace_id = $1",
        [fixture.workspaceId]
      )
      expect(requests.rows).toEqual([
        { status: "cancelled", version: 2 },
        { status: "cancelled", version: 2 },
      ])
      const audits = await pool.query(
        "SELECT resource_id FROM audit_logs WHERE workspace_id = $1 AND action = 'approval_request.cancelled'",
        [fixture.workspaceId]
      )
      const events = await pool.query(
        "SELECT payload FROM outbox_messages WHERE workspace_id = $1 AND event_type = 'approval_request.cancelled'",
        [fixture.workspaceId]
      )
      expect(audits.rows).toHaveLength(2)
      expect(events.rows).toHaveLength(2)
      const wakes = await pool.query(
        "SELECT id FROM outbox_messages WHERE workspace_id = $1 AND kind = 'workflow_execution' AND payload->>'executionId' = $2",
        [fixture.workspaceId, parent.executionId]
      )
      expect(wakes.rows).toEqual(wakesBefore.rows)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("creates one redacted exact intent and executes its stored normalized parameters after approval", async () => {
    const fixture = await createFixture()
    try {
      const proposed = await invoke(fixture)
      expect(proposed).toMatchObject({ outcome: "awaiting_consent" })
      expect(provider.requests).toHaveLength(0)
      const view = await consent(fixture)
      expect(view.intent).toMatchObject({
        connectionId: fixture.connectionId,
        connector: "test",
        operationId: "deterministic.update",
        operationRevision: "1",
        digestVersion: "jcs-sha256-v1",
        invocationIdempotencyKey: `${fixture.executionId}:action`,
        status: "awaiting_consent",
      })
      expect(view.intent.canonicalDigest).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(view.approvalRequest).toMatchObject({
        audience: "external_subject",
        timeoutAction: "auto_reject",
        actionIntentDigest: view.intent.canonicalDigest,
      })
      expect(view.intent.safeDisplay).toEqual({
        title: "Update resource",
        details: {
          Resource: "record-one",
          Value: "&lt;new value&gt;",
        },
      })
      expect(JSON.stringify(view.intent.safeDisplay)).not.toContain(
        fixture.input.secret
      )
      await decide(fixture, "approved")
      const decisionFacts = await db.query.connectorAuditFacts.findMany({
        where: { actionIntentId: view.intent.id },
      })
      expect(decisionFacts.map(({ factType }) => factType)).toEqual(
        expect.arrayContaining([
          "action_intent.created",
          "action_intent.consent_approved",
        ])
      )
      const executed = await invoke(fixture)
      expect(executed).toEqual({
        outcome: "completed",
        result: {
          resourceId: "record-one",
          value: "<new value>",
          version: "version-two",
        },
      })
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toEqual([
        expect.objectContaining({
          body: { value: "<new value>", secret: fixture.input.secret },
          idempotencyKey: `${fixture.executionId}:action`,
          ifMatch: "version-one",
          path: "/resources/record-one",
        }),
      ])
      expect(JSON.stringify(executed)).not.toContain(fixture.input.secret)
      expect(JSON.stringify(executed)).not.toContain("rawProviderField")
      const terminalFacts = await db.query.connectorAuditFacts.findMany({
        where: { actionIntentId: view.intent.id },
      })
      expect(terminalFacts.map(({ factType }) => factType)).toEqual(
        expect.arrayContaining([
          "action_intent.ready",
          "action_intent.executing",
          "action_intent.succeeded",
        ])
      )
      expect(JSON.stringify(terminalFacts)).not.toContain(fixture.input.secret)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("pauses an Execution for consent and resumes it through the stored intent", async () => {
    const fixture = await createFixture("worker-boundary", false)
    const worker = runs()
    try {
      await worker.execute(fixture.executionId)
      expect(
        await repositories.execution.getExecutionById(db, fixture.executionId)
      ).toMatchObject({ status: "paused" })
      expect(provider.requests).toHaveLength(0)
      await decide(fixture, "approved")
      await worker.execute(fixture.executionId)
      expect(
        await repositories.execution.getExecutionById(db, fixture.executionId)
      ).toMatchObject({ status: "succeeded" })
      const steps = await repositories.checkpoint.getStepsForExecution(
        db,
        fixture.executionId
      )
      expect(steps.find(({ nodeId }) => nodeId === "action")?.output).toEqual({
        resourceId: "worker-boundary",
        value: "<new value>",
        version: "version-two",
      })
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(1)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it.each([
    ["human rejection", "human"],
    ["timeout rejection", "timeout"],
  ])("performs no provider side effect after %s", async (_label, reason) => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      if (reason === "human") {
        await decide(fixture, "rejected")
      } else {
        const view = await consent(fixture)
        const timeout =
          await repositories.approvalRequest.claimAndDecideTimedOutApprovalRequest(
            db,
            new Date(view.approvalRequest.expiresAt!.getTime() + 1),
            fixture.workspaceId
          )
        expect(timeout.outcome).toBe("decided")
      }
      await expect(invoke(fixture)).resolves.toMatchObject({
        outcome: "rejected",
        reason,
      })
      expect((await consent(fixture)).intent.status).toBe("rejected")
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("returns the original intent for an exact duplicate and rejects conflicting content", async () => {
    const fixture = await createFixture()
    try {
      const first = await invoke(fixture)
      const repeated = await invoke(fixture)
      expect(repeated).toEqual(first)
      const duplicateCount = await pool.query<{ count: string }>(
        "SELECT count(*) FROM action_intents WHERE execution_id = $1",
        [fixture.executionId]
      )
      expect(duplicateCount.rows[0]?.count).toBe("1")
      await expect(
        invoke(fixture, { ...fixture.input, value: "different" })
      ).rejects.toMatchObject({
        code: "idempotency_conflict",
      } satisfies Partial<ConnectorGatewayError>)
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it.each([
    ["reauthorization_required", "connection_reauthorization_required"],
    ["scope_insufficient", "connection_scope_insufficient"],
  ])(
    "returns the stable %s error before creating an intent",
    async (boundary, code) => {
      const fixture = await createFixture()
      try {
        if (boundary === "reauthorization_required") {
          await pool.query(
            "UPDATE connections SET status = 'reauthorization_required', credential_encrypted = NULL WHERE id = $1",
            [fixture.connectionId]
          )
        } else {
          await pool.query("UPDATE connections SET scopes = $1 WHERE id = $2", [
            ["profile"],
            fixture.connectionId,
          ])
        }
        await expect(invoke(fixture)).rejects.toMatchObject({
          code,
        } satisfies Partial<ConnectorGatewayError>)
        const intentCount = await pool.query<{ count: string }>(
          "SELECT count(*) FROM action_intents WHERE execution_id = $1",
          [fixture.executionId]
        )
        expect(intentCount.rows[0]?.count).toBe("0")
      } finally {
        await removeWorkspace(fixture.workspaceId)
      }
    }
  )
  it.each([
    ["reauthorization_required", "connection_reauthorization_required"],
    ["scope_insufficient", "connection_scope_insufficient"],
  ])(
    "revalidates the stable %s error on intent replay",
    async (boundary, code) => {
      const fixture = await createFixture()
      try {
        await invoke(fixture)
        if (boundary === "reauthorization_required") {
          await pool.query(
            "UPDATE connections SET status = 'reauthorization_required', credential_encrypted = NULL WHERE id = $1",
            [fixture.connectionId]
          )
        } else {
          await pool.query("UPDATE connections SET scopes = $1 WHERE id = $2", [
            ["profile"],
            fixture.connectionId,
          ])
        }
        await expect(invoke(fixture)).rejects.toMatchObject({
          code,
        } satisfies Partial<ConnectorGatewayError>)
      } finally {
        await removeWorkspace(fixture.workspaceId)
      }
    }
  )
  it("preserves a terminal success after the Connection requires reauthorization", async () => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      const completed = await invoke(fixture)
      await pool.query(
        "UPDATE connections SET status = 'reauthorization_required', credential_encrypted = NULL WHERE id = $1",
        [fixture.connectionId]
      )
      await expect(invoke(fixture)).resolves.toEqual(completed)
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(1)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("does not classify an Environment policy denial as missing Connection scopes", async () => {
    const fixture = await createFixture()
    try {
      await pool.query(
        "UPDATE environments SET connector_access_policy = $1 WHERE id = $2",
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
          fixture.environmentId,
        ]
      )
      await expect(invoke(fixture)).rejects.toMatchObject({
        code: "connector_rejected",
      } satisfies Partial<ConnectorGatewayError>)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("lets only one duplicate worker dispatch the approved side effect", async () => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      const results = await Promise.allSettled([
        invoke(fixture),
        invoke(fixture),
      ])
      expect(
        results.filter(({ status }) => status === "fulfilled")
      ).toHaveLength(1)
      expect(
        results.filter(({ status }) => status === "rejected")
      ).toHaveLength(1)
      expect(
        provider.requests.filter(({ path }) => path === "/resources/record-one")
      ).toHaveLength(1)
      expect((await consent(fixture)).intent.status).toBe("succeeded")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("cancels the intent without dispatch when Decision races Connection revocation", async () => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      const outcomes = await Promise.allSettled([
        decide(fixture, "approved"),
        revoke(fixture),
      ])
      expect(outcomes[1]).toMatchObject({
        status: "fulfilled",
        value: { outcome: "revoked" },
      })
      const view = await consent(fixture)
      expect(view.intent.status).toBe("cancelled")
      expect(["cancelled", "decided"]).toContain(view.approvalRequest.status)
      await expect(invoke(fixture)).rejects.toBeInstanceOf(
        ConnectorGatewayError
      )
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("cancels the intent without dispatch when Decision races subject disablement", async () => {
    const fixture = await createFixture()
    const [actor] = await db
      .insert(schema.users)
      .values({
        name: "Connector race actor",
        email: `connector-race-${randomUUID()}@example.com`,
      })
      .returning()
    try {
      await invoke(fixture)
      const outcomes = await Promise.allSettled([
        decide(fixture, "approved"),
        repositories.externalSubject.disableExternalSubject(
          db,
          fixture.workspaceId,
          fixture.externalSubjectId,
          actor.id
        ),
      ])
      if (outcomes[1]?.status === "rejected") throw outcomes[1].reason
      expect(outcomes[1]).toMatchObject({
        status: "fulfilled",
        value: { status: "disabled" },
      })
      const view = await consent(fixture)
      expect(view.intent.status).toBe("cancelled")
      await expect(invoke(fixture)).rejects.toBeInstanceOf(
        ConnectorGatewayError
      )
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
      await pool.query("DELETE FROM users WHERE id = $1", [actor.id])
    }
  })
  it("atomically chooses execution or cancellation after an approving Decision", async () => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      const [execution, cancellation] = await Promise.allSettled([
        invoke(fixture),
        cancelExecution(fixture),
      ])
      if (cancellation.status === "rejected") throw cancellation.reason
      expect(cancellation.status).toBe("fulfilled")
      const view = await consent(fixture)
      if (view.intent.status === "cancelled") {
        expect(cancellation.value.outcome).toBe("cancelled")
        expect(execution.status).toBe("rejected")
        expect(
          provider.requests.filter(({ method }) => method === "PUT")
        ).toHaveLength(0)
      } else {
        expect(["cancelled", "execution_not_cancellable"]).toContain(
          cancellation.value.outcome
        )
        expect(execution.status).toBe("fulfilled")
        expect(view.intent.status).toBe("succeeded")
        expect(
          provider.requests.filter(({ method }) => method === "PUT")
        ).toHaveLength(1)
      }
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it.each(["root", "nested"])(
    "cancels a %s Execution without deadlocking a claim that holds the Approval Request first",
    async (kind) => {
      const fixture = await createFixture()
      const client = await pool.connect()
      let transactionOpen = false
      try {
        const cancellingFixture =
          kind === "nested" ? await attachParent(fixture) : fixture
        await invoke(fixture)
        await decide(fixture, "approved")
        await client.query("BEGIN")
        transactionOpen = true
        await client.query(
          "SELECT id FROM approval_requests WHERE workspace_id = $1 FOR UPDATE",
          [fixture.workspaceId]
        )
        const cancelling = cancelExecution(cancellingFixture)
        // Proceed only once PostgreSQL reports the cancel blocked behind this transaction's lock.
        const { rows } = await client.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid"
        )
        await waitForLockWait(rows[0].pid)
        // A claim takes the request, then the Execution; a cancel holding the Execution first would deadlock here.
        await client.query("SET LOCAL lock_timeout = '5s'")
        await client.query(
          "SELECT id FROM executions WHERE id = $1 FOR UPDATE",
          [fixture.executionId]
        )
        await client.query(
          "SELECT id FROM executions WHERE id = $1 FOR UPDATE",
          [cancellingFixture.executionId]
        )
        await client.query("COMMIT")
        transactionOpen = false
        expect(["cancelled", "execution_not_cancellable"]).toContain(
          (await cancelling).outcome
        )
      } finally {
        if (transactionOpen) await client.query("ROLLBACK")
        client.release()
        await removeWorkspace(fixture.workspaceId)
      }
    }
  )
  describe("beside a transaction that holds the End User, as another run's claim does", () => {
    async function claimWrite(fixture: Fixture, sent = true): Promise<string> {
      await invoke(fixture)
      await decide(fixture, "approved")
      const { intent } = await consent(fixture)
      const authority = {
        actionIntentId: intent.id,
        executionClaimId: fixture.executionClaimId,
        provider: deterministicSideEffectOperation.provider,
        actionFamily: deterministicSideEffectOperation.actionFamily,
        requiredScopes: deterministicSideEffectOperation.requiredScopes,
        now: new Date(),
      }
      const claim = await repositories.actionIntent.claimApprovedActionIntent(
        db,
        authority
      )
      expect(claim?.outcome).toBe("claimed")
      if (sent)
        await repositories.actionIntent.beginActionIntentDispatch(db, authority)
      return intent.id
    }

    const ending = {
      costMicros: 0n,
      costUnpriced: false,
      tokensInput: 0,
      tokensOutput: 0,
    }
    const recordFact = async (fixture: Fixture) => {
      const connection = await repositories.connection.getConnection(
        db,
        fixture,
        fixture.connectionId
      )
      if (!connection) throw new Error("Fixture Connection is missing")
      return repositories.connectorAudit.recordConnectionFact(db, {
        connection,
        factType: "connection.revoked",
        occurredAt: new Date(),
      })
    }
    const timeOut = (fixture: Fixture) =>
      repositories.approvalRequest.claimAndDecideTimedOutApprovalRequest(
        db,
        new Date(Date.now() + 365 * 24 * 60 * 60_000),
        fixture.workspaceId
      )

    const sides: [
      string,
      "claimed write" | "proposed write" | "question" | "nothing",
      (fixture: Fixture, intentId: string) => Promise<unknown>,
    ][] = [
      [
        "records a write that landed",
        "claimed write",
        (fixture, actionIntentId) =>
          repositories.actionIntent.completeActionIntent(db, {
            actionIntentId,
            executionClaimId: fixture.executionClaimId,
            result: {},
            completedAt: new Date(),
          }),
      ],
      [
        "records a write that failed",
        "claimed write",
        (fixture, actionIntentId) =>
          repositories.actionIntent.failActionIntent(db, {
            actionIntentId,
            executionClaimId: fixture.executionClaimId,
            status: "failed",
            error: {
              code: "provider_failed",
              message: "failed",
              outcomeUnknown: false,
            },
            failedAt: new Date(),
          }),
      ],
      [
        "finishes a run",
        "proposed write",
        (fixture) =>
          repositories.execution.completeExecution(
            db,
            fixture.executionId,
            fixture.executionClaimId,
            { ...ending, status: "succeeded" }
          ),
      ],
      [
        "fails a run",
        "proposed write",
        (fixture) =>
          repositories.failedExecution.failExecution(
            db,
            fixture.executionId,
            fixture.executionClaimId,
            { ...ending, error: { message: "failed" } }
          ),
      ],
      ["cancels a run", "proposed write", cancelExecution],
      ["revokes a Connection", "proposed write", revoke],
      ["revokes a Connection", "nothing", revoke],
      ["records a Connection fact", "nothing", recordFact],
      ["times out an approval", "proposed write", timeOut],
      ["times out an approval", "question", timeOut],
    ]

    // These hold the Approval Request first, as a disable or erasure does too.
    const holdsApproval = new Set<unknown>(
      sides.slice(-6).map(([, , side]) => side)
    )

    it.each(sides)("%s (%s) without deadlocking", async (_what, open, run) => {
      const fixture = await createFixture()
      const holder = await pool.connect()
      let transactionOpen = false
      try {
        let intentId = ""
        if (open === "claimed write") intentId = await claimWrite(fixture)
        if (open === "proposed write") await invoke(fixture)
        if (open === "question")
          await repositories.approvalRequest.createApprovalRequest(db, {
            workspaceId: fixture.workspaceId,
            environmentId: fixture.environmentId,
            executionId: fixture.executionId,
            nodeId: "question",
            audience: "external_subject",
            externalSubjectId: fixture.externalSubjectId,
            display: { title: "Continue?" },
            expiresAt: new Date(Date.now() + 60_000),
            timeoutAction: "auto_reject",
          })
        await holder.query("BEGIN")
        transactionOpen = true
        await holder.query(
          "SELECT id FROM external_subjects WHERE id = $1 FOR UPDATE",
          [fixture.externalSubjectId]
        )
        const { rows } = await holder.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid"
        )
        const running = run(fixture, intentId)
        await waitForLockWait(rows[0].pid)
        // What a claim takes next, and the event row it ends with.
        await holder.query("SET LOCAL lock_timeout = '5s'")
        await holder.query(
          "SELECT id FROM environments WHERE id = $1 FOR UPDATE",
          [fixture.environmentId]
        )
        await holder.query(
          "SELECT 1 FROM external_subject_environments WHERE external_subject_id = $1 FOR UPDATE",
          [fixture.externalSubjectId]
        )
        if (run !== cancelExecution)
          await holder.query(
            "SELECT id FROM connections WHERE id = $1 FOR UPDATE",
            [fixture.connectionId]
          )
        // What disabling or erasing the End User takes next.
        if (!holdsApproval.has(run)) {
          await holder.query(
            "SELECT id FROM action_intents WHERE execution_id = $1 FOR UPDATE",
            [fixture.executionId]
          )
          await holder.query(
            "SELECT id FROM executions WHERE id = $1 FOR UPDATE",
            [fixture.executionId]
          )
        }
        await holder.query("COMMIT")
        transactionOpen = false
        expect(await running).toBeDefined()
      } finally {
        if (transactionOpen) await holder.query("ROLLBACK")
        holder.release()
        await removeWorkspace(fixture.workspaceId)
      }
    })

    it.each([
      ["sent", "outcome_unknown"],
      ["sent by an earlier worker", "outcome_unknown"],
      ["not sent", "failed"],
    ])(
      "settles its own claimed write that was %s when the run fails without recording it",
      async (state, status) => {
        const fixture = await createFixture()
        try {
          await claimWrite(fixture, state !== "not sent")
          if (state === "sent by an earlier worker") {
            fixture.executionClaimId = "later-worker"
            await pool.query(
              "UPDATE executions SET leased_by = $2 WHERE id = $1",
              [fixture.executionId, fixture.executionClaimId]
            )
          }
          await repositories.failedExecution.failExecution(
            db,
            fixture.executionId,
            fixture.executionClaimId,
            { ...ending, error: { message: "database went away" } }
          )
          expect((await consent(fixture)).intent.status).toBe(status)
          const events = await pool.query(
            "SELECT 1 FROM outbox_messages WHERE workspace_id = $1 AND event_type = 'action_intent.failed'",
            [fixture.workspaceId]
          )
          expect(events.rowCount).toBe(1)
        } finally {
          await removeWorkspace(fixture.workspaceId)
        }
      }
    )
  })
  it("cancels an Execution without deadlocking a claim that starts while the cancel holds the Approval Request", async () => {
    const fixture = await createFixture()
    const blocker = await pool.connect()
    let transactionOpen = false
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      const { intent } = await consent(fixture)
      await blocker.query("BEGIN")
      transactionOpen = true
      await blocker.query(
        "SELECT id FROM approval_requests WHERE workspace_id = $1 FOR UPDATE",
        [fixture.workspaceId]
      )
      const { rows } = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      )
      const cancelling = cancelExecution(fixture)
      const cancelPid = await waitForLockWait(rows[0].pid)
      const claiming = repositories.actionIntent.claimApprovedActionIntent(db, {
        actionIntentId: intent.id,
        executionClaimId: fixture.executionClaimId,
        provider: deterministicSideEffectOperation.provider,
        actionFamily: deterministicSideEffectOperation.actionFamily,
        requiredScopes: deterministicSideEffectOperation.requiredScopes,
        now: new Date(),
      })
      // The cancel now wins the request; its audit insert then needs the rows a claim locks first.
      await waitForLockWait(cancelPid)
      await blocker.query("COMMIT")
      transactionOpen = false
      const [cancellation, claim] = await Promise.all([cancelling, claiming])
      expect(cancellation.outcome).toBe("cancelled")
      expect(claim?.outcome).toBe("cancelled")
    } finally {
      if (transactionOpen) await blocker.query("ROLLBACK")
      blocker.release()
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it.each(["root", "nested"])(
    "cancels a %s Execution without deadlocking a claim that already holds the Execution's advisory lock",
    async (kind) => {
      const fixture = await createFixture()
      const blocker = await pool.connect()
      let transactionOpen = false
      try {
        const cancellingFixture =
          kind === "nested" ? await attachParent(fixture) : fixture
        await invoke(fixture)
        await decide(fixture, "approved")
        const { intent } = await consent(fixture)
        await blocker.query("BEGIN")
        transactionOpen = true
        // The first row a claim locks, so it stops holding only its advisory lock.
        await blocker.query(
          "SELECT id FROM external_subjects WHERE id = $1 FOR UPDATE",
          [fixture.externalSubjectId]
        )
        const { rows } = await blocker.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid"
        )
        const claiming = repositories.actionIntent.claimApprovedActionIntent(
          db,
          {
            actionIntentId: intent.id,
            executionClaimId: fixture.executionClaimId,
            provider: deterministicSideEffectOperation.provider,
            actionFamily: deterministicSideEffectOperation.actionFamily,
            requiredScopes: deterministicSideEffectOperation.requiredScopes,
            now: new Date(),
          }
        )
        const claimPid = await waitForLockWait(rows[0].pid)
        const cancelling = cancelExecution(cancellingFixture)
        await waitForLockWait(claimPid)
        await blocker.query("COMMIT")
        transactionOpen = false
        const [claim, cancellation] = await Promise.all([claiming, cancelling])
        expect(claim?.outcome).toBe("claimed")
        expect(cancellation.outcome).toBe("execution_not_cancellable")
      } finally {
        if (transactionOpen) await blocker.query("ROLLBACK")
        blocker.release()
        await removeWorkspace(fixture.workspaceId)
      }
    }
  )
  it("resolves concurrent conflicting invocation content to one intent and one conflict", async () => {
    const fixture = await createFixture()
    try {
      const outcomes = await Promise.allSettled([
        invoke(fixture),
        invoke(fixture, { ...fixture.input, value: "conflicting" }),
      ])
      expect(
        outcomes.filter(({ status }) => status === "fulfilled")
      ).toHaveLength(1)
      const rejection = outcomes.find(({ status }) => status === "rejected")
      expect(rejection).toMatchObject({
        status: "rejected",
        reason: { code: "idempotency_conflict" },
      })
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("rejects mutation of every persisted consent snapshot", async () => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      const view = await consent(fixture)
      await expect(
        pool.query(
          "UPDATE action_intents SET normalized_parameters = $1 WHERE id = $2",
          [JSON.stringify({ replaced: true }), view.intent.id]
        )
      ).rejects.toThrow("Action Intent snapshots are immutable")
      await expect(
        pool.query("UPDATE approval_requests SET display = $1 WHERE id = $2", [
          JSON.stringify({ title: "Changed" }),
          view.approvalRequest.id,
        ])
      ).rejects.toThrow("Approval Request snapshots are immutable")
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("re-verifies the stored digest before provider execution", async () => {
    const fixture = await createFixture()
    try {
      await invoke(fixture)
      const view = await consent(fixture)
      await pool.query(
        "ALTER TABLE action_intents DISABLE TRIGGER action_intent_snapshots_immutable"
      )
      try {
        await pool.query(
          `UPDATE action_intents
           SET normalized_parameters = jsonb_set(normalized_parameters, '{value}', '"tampered"'),
               canonical_envelope = jsonb_set(canonical_envelope, '{parameters,value}', '"tampered"')
           WHERE id = $1`,
          [view.intent.id]
        )
      } finally {
        await pool.query(
          "ALTER TABLE action_intents ENABLE TRIGGER action_intent_snapshots_immutable"
        )
      }
      await decide(fixture, "approved")
      await expect(invoke(fixture)).rejects.toMatchObject({
        code: "digest_mismatch",
      } satisfies Partial<ConnectorGatewayError>)
      expect(provider.requests).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("reconciles a lost provider response with one side effect", async () => {
    const fixture = await createFixture("response-lost")
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      await expect(invoke(fixture)).resolves.toMatchObject({
        outcome: "completed",
      })
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(2)
      expect(provider.effects.get("response-lost")).toBe(1)
      expect((await consent(fixture)).intent.status).toBe("succeeded")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("recovers a committed dispatch after worker failure without duplicating the provider effect", async () => {
    const fixture = await createFixture("response-lost")
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      const view = await consent(fixture)
      const claimed = await repositories.actionIntent.claimApprovedActionIntent(
        db,
        {
          actionIntentId: view.intent.id,
          executionClaimId: fixture.executionClaimId,
          provider: "test",
          actionFamily: "test",
          requiredScopes: ["write:resources"],
          now: new Date(),
        }
      )
      expect(claimed?.outcome).toBe("claimed")
      await repositories.actionIntent.beginActionIntentDispatch(db, {
        provider: "test",
        actionFamily: "test",
        requiredScopes: ["write:resources"],
        actionIntentId: view.intent.id,
        executionClaimId: fixture.executionClaimId,
        now: new Date(),
      })
      await expect(
        fetch(new URL("/resources/response-lost", provider.baseUrl), {
          method: "PUT",
          headers: {
            authorization: `Bearer ${fixture.accessToken}`,
            "content-type": "application/json",
            "if-match": "version-one",
            "idempotency-key": `${fixture.executionId}:action`,
          },
          body: JSON.stringify({
            value: fixture.input.value.trim(),
            secret: fixture.input.secret,
          }),
        })
      ).rejects.toThrow()
      await pool.query(
        "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
        [new Date(Date.now() - 1), fixture.executionId]
      )
      const recoveredClaimId = `recovered:${randomUUID()}`
      const recoveredExecution = await repositories.execution.startExecution(
        db,
        fixture.executionId,
        recoveredClaimId,
        new Date(Date.now() + 60_000)
      )
      expect(recoveredExecution?.leasedBy).toBe(recoveredClaimId)
      fixture.executionClaimId = recoveredClaimId
      await expect(invoke(fixture)).resolves.toMatchObject({
        outcome: "completed",
      })
      expect(provider.effects.get("response-lost")).toBe(1)
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(2)
      const terminalEvents = await pool.query<{
        event_type: string
        payload: Record<string, unknown>
      }>(
        "SELECT event_type, payload FROM outbox_messages WHERE workspace_id = $1 AND event_type = 'action_intent.executed'",
        [fixture.workspaceId]
      )
      expect(terminalEvents.rows).toEqual([
        {
          event_type: "action_intent.executed",
          payload: {
            actionIntentId: view.intent.id,
            executionId: fixture.executionId,
          },
        },
      ])
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("revalidates authority before recovering an executing intent", async () => {
    const fixture = await createFixture()
    const [actor] = await db
      .insert(schema.users)
      .values({
        name: "Connector recovery actor",
        email: `connector-recovery-${randomUUID()}@example.com`,
      })
      .returning()
    try {
      await invoke(fixture)
      await decide(fixture, "approved")
      const view = await consent(fixture)
      const claimed = await repositories.actionIntent.claimApprovedActionIntent(
        db,
        {
          actionIntentId: view.intent.id,
          executionClaimId: fixture.executionClaimId,
          provider: "test",
          actionFamily: "test",
          requiredScopes: ["write:resources"],
          now: new Date(),
        }
      )
      expect(claimed?.outcome).toBe("claimed")
      await repositories.externalSubject.disableExternalSubject(
        db,
        fixture.workspaceId,
        fixture.externalSubjectId,
        actor.id
      )
      await pool.query(
        "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
        [new Date(Date.now() - 1), fixture.executionId]
      )
      const recoveredClaimId = `recovered:${randomUUID()}`
      const recoveredExecution = await repositories.execution.startExecution(
        db,
        fixture.executionId,
        recoveredClaimId,
        new Date(Date.now() + 60_000)
      )
      expect(recoveredExecution?.leasedBy).toBe(recoveredClaimId)
      fixture.executionClaimId = recoveredClaimId
      await expect(invoke(fixture)).rejects.toMatchObject({
        code: "authorization_revoked",
      })
      expect((await consent(fixture)).intent.status).toBe("failed")
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(0)
    } finally {
      await removeWorkspace(fixture.workspaceId)
      await pool.query("DELETE FROM users WHERE id = $1", [actor.id])
    }
  })
  it("fences a terminal write after lease expiry and recovers idempotently", async () => {
    const fixture = await createFixture("lease-expired")
    let expireLease = true
    const leaseExpiringOperation: ConnectorSideEffectOperation = Object.freeze({
      ...deterministicSideEffectOperation,
      execute: async (
        parameters: unknown,
        preconditions: unknown,
        credential: ConnectorReadCredential,
        idempotencyKey: string,
        signal?: AbortSignal
      ) => {
        const result = await deterministicSideEffectOperation.execute(
          parameters,
          preconditions,
          credential,
          idempotencyKey,
          signal
        )
        if (expireLease) {
          expireLease = false
          await pool.query(
            "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
            [new Date(Date.now() - 1), fixture.executionId]
          )
        }
        return result
      },
    })
    const gateway = new ConnectorGateway(db, {
      "deterministic.update": leaseExpiringOperation,
    })
    const execute = () =>
      gateway.execute({
        executionId: fixture.executionId,
        workspaceId: fixture.workspaceId,
        nodeId: "action",
        connectionId: fixture.connectionId,
        operationId: "deterministic.update",
        operationInput: fixture.input,
        invocationIdempotencyKey: `${fixture.executionId}:action`,
        executionClaimId: fixture.executionClaimId,
      })
    try {
      await execute()
      await decide(fixture, "approved")
      await expect(execute()).rejects.toThrow(
        "Action Intent completion was lost"
      )
      expect((await consent(fixture)).intent.status).toBe("executing")
      const recoveredClaimId = `recovered:${randomUUID()}`
      const recoveredExecution = await repositories.execution.startExecution(
        db,
        fixture.executionId,
        recoveredClaimId,
        new Date(Date.now() + 60_000)
      )
      expect(recoveredExecution?.leasedBy).toBe(recoveredClaimId)
      fixture.executionClaimId = recoveredClaimId
      await expect(execute()).resolves.toMatchObject({ outcome: "completed" })
      expect(provider.effects.get("lease-expired")).toBe(1)
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(2)
      expect((await consent(fixture)).intent.status).toBe("succeeded")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it("does not retry a possibly sent request without a provider idempotency guarantee", async () => {
    const fixture = await createFixture("outcome-unknown")
    const unsafeOperation: ConnectorSideEffectOperation = Object.freeze({
      ...deterministicSideEffectOperation,
      retrySafety: "none",
    })
    const gateway = new ConnectorGateway(db, {
      "deterministic.update": unsafeOperation,
    })
    const execute = () =>
      gateway.execute({
        executionId: fixture.executionId,
        workspaceId: fixture.workspaceId,
        nodeId: "action",
        connectionId: fixture.connectionId,
        operationId: "deterministic.update",
        operationInput: fixture.input,
        invocationIdempotencyKey: `${fixture.executionId}:action`,
        executionClaimId: fixture.executionClaimId,
      })
    try {
      await execute()
      await decide(fixture, "approved")
      await expect(execute()).rejects.toMatchObject({
        code: "outcome_unknown",
      })
      expect(
        provider.requests.filter(({ method }) => method === "PUT")
      ).toHaveLength(1)
      expect((await consent(fixture)).intent.status).toBe("outcome_unknown")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })
  it.each([
    ["stale", "precondition_failed", "stale"],
    ["provider-failure", "provider_failed", "failed"],
    ["outcome-unknown", "outcome_unknown", "outcome_unknown"],
  ])(
    "stores a bounded normalized %s provider outcome",
    async (resourceId, code, status) => {
      const fixture = await createFixture(resourceId)
      try {
        await invoke(fixture)
        await decide(fixture, "approved")
        await expect(invoke(fixture)).rejects.toMatchObject({ code })
        const view = await consent(fixture)
        expect(view.intent.status).toBe(status)
        expect(view.intent.normalizedError?.code).toBe(code)
        expect(JSON.stringify(view.intent.normalizedError)).not.toContain(
          "connector-secret"
        )
        let expectedSideEffects = 1
        if (resourceId === "stale") expectedSideEffects = 0
        if (resourceId === "outcome-unknown") expectedSideEffects = 2
        expect(
          provider.requests.filter(({ method }) => method === "PUT")
        ).toHaveLength(expectedSideEffects)
        const events = await pool.query<{ payload: Record<string, unknown> }>(
          "SELECT payload FROM outbox_messages WHERE workspace_id = $1 AND event_type = 'action_intent.failed'",
          [fixture.workspaceId]
        )
        expect(events.rows).toEqual([
          {
            payload: {
              actionIntentId: view.intent.id,
              executionId: fixture.executionId,
            },
          },
        ])
      } finally {
        await removeWorkspace(fixture.workspaceId)
      }
    }
  )
  it("does not construct an intent for an unregistered operation", async () => {
    const fixture = await createFixture()
    try {
      await expect(
        new ConnectorGateway(db, connectorOperationRegistry).execute({
          executionId: fixture.executionId,
          workspaceId: fixture.workspaceId,
          nodeId: "action",
          connectionId: fixture.connectionId,
          operationId: "unregistered.side-effect",
          operationInput: fixture.input,
          invocationIdempotencyKey: `${fixture.executionId}:action`,
          executionClaimId: fixture.executionClaimId,
        })
      ).rejects.toBeInstanceOf(ConnectorGatewayError)
      const intentCount = await pool.query<{ count: string }>(
        "SELECT count(*) FROM action_intents WHERE execution_id = $1",
        [fixture.executionId]
      )
      expect(intentCount.rows[0]?.count).toBe("0")
    } finally {
      await removeWorkspace(fixture.workspaceId)
    }
  })

  describe("a Workflow Execution that fails while its Agents work", () => {
    const claimOf = async (fixture: Fixture) => ({
      actionIntentId: (await consent(fixture)).intent.id,
      executionClaimId: fixture.executionClaimId,
      provider: "test",
      actionFamily: "test",
      requiredScopes: ["write:resources"],
      now: new Date(),
    })

    const statusOf = async (executionId: string) =>
      (await repositories.execution.getExecutionById(db, executionId))?.status

    async function runParent(parent: Fixture): Promise<void> {
      await pool.query(
        "UPDATE executions SET status = 'running', leased_by = $2, lease_expires_at = now() + interval '1 minute' WHERE id = $1",
        [parent.executionId, parent.executionClaimId]
      )
    }

    const failParent = (parent: Fixture, leasedBy = parent.executionClaimId) =>
      repositories.failedExecution.failExecution(
        db,
        parent.executionId,
        leasedBy,
        {
          error: { message: "a branch failed" },
          costMicros: 0n,
          costUnpriced: false,
          tokensInput: 0,
          tokensOutput: 0,
        }
      )

    async function addSibling(parent: Fixture): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO executions (workspace_id, environment_id, agent_id, agent_version_id, agent_contract_revision_id, environment, trigger, parent_execution_id, parent_node_id)
       SELECT workspace_id, environment_id, agent_id, agent_version_id, agent_contract_revision_id, environment, trigger, parent_execution_id, 'sibling'
       FROM executions WHERE parent_execution_id = $1 LIMIT 1 RETURNING id`,
        [parent.executionId]
      )
      return rows[0].id
    }

    async function withFailing(
      test: (fixture: Fixture, parent: Fixture) => Promise<void>,
      resourceId?: string
    ): Promise<void> {
      const fixture = await createFixture(resourceId)
      try {
        const parent = await attachParent(fixture)
        await runParent(parent)
        await test(fixture, parent)
      } finally {
        await removeWorkspace(fixture.workspaceId)
      }
    }

    it("cancels queued and running Agents and takes the running one's lease", () =>
      withFailing(async (fixture, parent) => {
        const sibling = await addSibling(parent)
        expect((await failParent(parent))?.status).toBe("failed")
        expect(await statusOf(sibling)).toBe("cancelled")
        const child = await repositories.execution.getExecutionById(
          db,
          fixture.executionId
        )
        expect(child).toMatchObject({ status: "cancelled", leasedBy: null })
        const audits = await pool.query<{ resource_id: string }>(
          "SELECT resource_id FROM audit_logs WHERE workspace_id = $1 AND action = 'execution.cancelled' AND actor_user_id IS NULL AND actor_environment_key_id IS NULL",
          [fixture.workspaceId]
        )
        expect(audits.rows.map((row) => row.resource_id).sort()).toEqual(
          [sibling, fixture.executionId].sort()
        )
      }))

    it("keeps the usage a cancelled Agent already recorded", () =>
      withFailing(async (fixture, parent) => {
        const sibling = await addSibling(parent)
        for (const [nodeId, unpriced] of [
          ["agent:model:0", false],
          ["agent:model:1", true],
        ] as const) {
          await new CheckpointsService().recordStep({
            executionId: fixture.executionId,
            workspaceId: fixture.workspaceId,
            leasedBy: fixture.executionClaimId,
            nodeId,
            nodeType: "ai",
            input: {},
            output: {},
            startedAt: new Date(),
            endedAt: new Date(),
            tokensInput: 100,
            tokensOutput: 20,
            costMicros: 7n,
            costUnpriced: unpriced,
            completed: new Map([[nodeId, {}]]),
            variables: {},
          })
        }
        await failParent(parent)
        expect(
          await repositories.execution.getExecutionById(db, fixture.executionId)
        ).toMatchObject({
          status: "cancelled",
          tokensInput: 200,
          tokensOutput: 40,
          costMicros: 14n,
          costUnpriced: true,
        })
        expect(
          await repositories.execution.getExecutionById(db, sibling)
        ).toMatchObject({ status: "cancelled", tokensInput: 0 })
      }))

    it("cancels a paused Agent's consent, with one audit entry and one event", () =>
      withFailing(async (fixture, parent) => {
        await invoke(fixture)
        await repositories.pauseClaim.claimPause(db, {
          workspaceId: fixture.workspaceId,
          executionId: fixture.executionId,
          leasedBy: fixture.executionClaimId,
          steps: [{ nodeId: "action", kind: "approval" }],
        })
        await failParent(parent)
        expect(await statusOf(fixture.executionId)).toBe("cancelled")
        const after = await consent(fixture)
        expect(after.intent.status).toBe("cancelled")
        expect(after.approvalRequest.status).toBe("cancelled")
        await expect(decide(fixture, "approved")).rejects.toThrow("cancelled")
        await expect(invoke(fixture)).rejects.toBeInstanceOf(
          ConnectorGatewayError
        )
        expect(provider.requests).toHaveLength(0)
        const recorded = await pool.query(
          "SELECT (SELECT count(*)::int FROM audit_logs WHERE resource_id = $1 AND action = 'approval_request.cancelled') AS audits, (SELECT count(*)::int FROM outbox_messages WHERE workspace_id = $2 AND event_type = 'approval_request.cancelled') AS events",
          [after.approvalRequest.id, fixture.workspaceId]
        )
        expect(recorded.rows).toEqual([{ audits: 1, events: 1 }])
      }))

    it("cancels its own pending Approval Request", () =>
      withFailing(async (fixture, parent) => {
        const root = await repositories.execution.getExecutionById(
          db,
          parent.executionId
        )
        const request =
          await repositories.approvalRequest.createApprovalRequest(db, {
            workspaceId: fixture.workspaceId,
            environmentId: fixture.environmentId,
            workflowId: root?.workflowId,
            executionId: parent.executionId,
            nodeId: "approval",
            audience: "workspace",
            display: { title: "Continue?" },
          })
        await failParent(parent)
        const { rows } = await pool.query(
          "SELECT status FROM approval_requests WHERE id = $1",
          [request?.id]
        )
        expect(rows).toEqual([{ status: "cancelled" }])
        const audits = await pool.query(
          "SELECT action, actor_user_id FROM audit_logs WHERE resource_id = $1",
          [request?.id]
        )
        expect(audits.rows).toEqual([
          { action: "approval_request.cancelled", actor_user_id: null },
        ])
      }))

    it("lets a sent write report, then stops its Agent; other Agents are cancelled", () =>
      withFailing(async (fixture, parent) => {
        const sibling = await addSibling(parent)
        await invoke(fixture)
        await decide(fixture, "approved")
        const claim = await claimOf(fixture)
        await repositories.actionIntent.claimApprovedActionIntent(db, claim)
        await repositories.actionIntent.beginActionIntentDispatch(db, claim)
        await failParent(parent)
        expect(await statusOf(parent.executionId)).toBe("failed")
        expect(await statusOf(sibling)).toBe("cancelled")
        expect(await statusOf(fixture.executionId)).toBe("running")
        expect(
          await repositories.execution.hasEndedParent(db, fixture.executionId)
        ).toBe(false)
        expect(
          (
            await repositories.actionIntent.completeActionIntent(db, {
              actionIntentId: claim.actionIntentId,
              executionClaimId: fixture.executionClaimId,
              result: {},
              completedAt: new Date(),
            })
          )?.status
        ).toBe("succeeded")
        expect(
          await repositories.execution.hasEndedParent(db, fixture.executionId)
        ).toBe(true)
      }))

    it("never sends a claimed write that was not sent, and records it as failed", () =>
      withFailing(async (fixture, parent) => {
        await invoke(fixture)
        await decide(fixture, "approved")
        const claim = await claimOf(fixture)
        await repositories.actionIntent.claimApprovedActionIntent(db, claim)
        await failParent(parent)
        expect(
          await repositories.actionIntent.beginActionIntentDispatch(db, claim)
        ).toBeUndefined()
        expect((await consent(fixture)).intent.status).toBe("failed")
        expect(provider.requests).toHaveLength(0)
      }))

    it("settles a write lost in a crash as unknown, without sending it again", () =>
      withFailing(async (fixture, parent) => {
        await invoke(fixture)
        await decide(fixture, "approved")
        const claim = await claimOf(fixture)
        await repositories.actionIntent.claimApprovedActionIntent(db, claim)
        await repositories.actionIntent.beginActionIntentDispatch(db, claim)
        await failParent(parent)
        await pool.query(
          "UPDATE executions SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
          [fixture.executionId]
        )
        const recovered = await repositories.execution.startExecution(
          db,
          fixture.executionId,
          "second-worker",
          new Date(Date.now() + 60_000)
        )
        expect(recovered?.status).toBe("running")
        await expect(
          invoke({ ...fixture, executionClaimId: "second-worker" })
        ).rejects.toBeInstanceOf(ConnectorGatewayError)
        expect((await consent(fixture)).intent.status).toBe("outcome_unknown")
        expect(provider.requests).toHaveLength(0)
      }))

    it.each([
      ["nothing", "paused", "paused"],
      ["the Agent", "already-resolved", "running"],
      ["the decision", "already-resolved", "running"],
      ["the timer", "already-resolved", "running"],
      ["the lease", "lease-lost", "running"],
      ["a step that never waited", "already-resolved", "running"],
    ])(
      "pauses on every waiting step or none: %s settled first",
      (settled, outcome, status) =>
        withFailing(async (fixture, parent) => {
          const request =
            await repositories.approvalRequest.createApprovalRequest(db, {
              workspaceId: fixture.workspaceId,
              environmentId: fixture.environmentId,
              executionId: parent.executionId,
              workflowId: (
                await repositories.execution.getExecutionById(
                  db,
                  parent.executionId
                )
              )?.workflowId,
              nodeId: "approval",
              audience: "workspace",
              display: { title: "Continue?" },
            })
          await repositories.waitTimer.createWaitTimer(db, {
            workspaceId: fixture.workspaceId,
            executionId: parent.executionId,
            nodeId: "wait",
            resumeAt: new Date(Date.now() + 60_000),
          })
          if (settled === "the Agent")
            await pool.query(
              "UPDATE executions SET status = 'succeeded' WHERE id = $1",
              [fixture.executionId]
            )
          if (settled === "the decision")
            await pool.query(
              "UPDATE approval_requests SET status = 'cancelled', cancelled_at = now() WHERE id = $1",
              [request?.id]
            )
          if (settled === "the timer")
            await pool.query(
              "UPDATE wait_timers SET fired = true, fired_at = now() WHERE execution_id = $1",
              [parent.executionId]
            )
          const claim = await repositories.pauseClaim.claimPause(db, {
            workspaceId: fixture.workspaceId,
            executionId: parent.executionId,
            leasedBy:
              settled === "the lease"
                ? "another-worker"
                : parent.executionClaimId,
            steps: [
              { nodeId: "agent", kind: "agent" },
              { nodeId: "approval", kind: "approval" },
              { nodeId: "wait", kind: "wait" },
              ...(settled === "a step that never waited"
                ? [{ nodeId: "unknown", kind: "wait" as const }]
                : []),
            ],
          })
          expect(claim.outcome).toBe(outcome)
          expect(await statusOf(parent.executionId)).toBe(status)
        })
    )

    it("does nothing without the lease", () =>
      withFailing(async (fixture, parent) => {
        expect(await failParent(parent, "another-worker")).toBeUndefined()
        expect(await statusOf(parent.executionId)).toBe("running")
        expect(await statusOf(fixture.executionId)).toBe("running")
      }))

    it("cancels nothing when it succeeds", () =>
      withFailing(async (fixture, parent) => {
        await repositories.execution.completeExecution(
          db,
          parent.executionId,
          parent.executionClaimId,
          {
            status: "succeeded",
            costMicros: 0n,
            costUnpriced: false,
            tokensInput: 0,
            tokensOutput: 0,
          }
        )
        expect(await statusOf(fixture.executionId)).toBe("running")
      }))

    it("refuses an Agent as the parent of another Agent", () =>
      withFailing(async (fixture) => {
        const child = await repositories.execution.getExecutionById(
          db,
          fixture.executionId
        )
        const nested =
          await repositories.nestedAgentExecution.startNestedAgentExecution(
            db,
            {
              workspaceId: fixture.workspaceId,
              parentExecutionId: fixture.executionId,
              nodeId: "grandchild",
              agentId: child?.agentId as string,
              agentContractRevisionId: child?.agentContractRevisionId as string,
              input: {},
            }
          )
        expect(nested.outcome).toBe("parent_not_found")
      }))

    it.each(["agent", "approval", "wait"] as const)(
      "waits for a waiting %s that is being settled before it pauses",
      (kind) =>
        withFailing(async (fixture, parent) => {
          const root = await repositories.execution.getExecutionById(
            db,
            parent.executionId
          )
          const request =
            await repositories.approvalRequest.createApprovalRequest(db, {
              workspaceId: fixture.workspaceId,
              environmentId: fixture.environmentId,
              workflowId: root?.workflowId,
              executionId: parent.executionId,
              nodeId: "approval",
              audience: "workspace",
              display: { title: "Continue?" },
            })
          await repositories.waitTimer.createWaitTimer(db, {
            workspaceId: fixture.workspaceId,
            executionId: parent.executionId,
            nodeId: "wait",
            resumeAt: new Date(Date.now() + 60_000),
          })
          const [settle, id] = {
            agent: [
              "UPDATE executions SET status = 'succeeded' WHERE id = $1",
              fixture.executionId,
            ],
            approval: [
              "UPDATE approval_requests SET status = 'cancelled', cancelled_at = now() WHERE id = $1",
              request?.id,
            ],
            wait: [
              "UPDATE wait_timers SET fired = true, fired_at = now() WHERE execution_id = $1",
              parent.executionId,
            ],
          }[kind] as [string, string]
          const client = await pool.connect()
          try {
            await client.query("BEGIN")
            await client.query(settle, [id])
            const { rows } = await client.query<{ pid: number }>(
              "SELECT pg_backend_pid() AS pid"
            )
            const claim = repositories.pauseClaim.claimPause(db, {
              workspaceId: fixture.workspaceId,
              executionId: parent.executionId,
              leasedBy: parent.executionClaimId,
              steps: [{ nodeId: kind, kind }],
            })
            await waitForLockWait(rows[0].pid)
            await client.query("COMMIT")
            expect((await claim).outcome).toBe("already-resolved")
            expect(await statusOf(parent.executionId)).toBe("running")
          } finally {
            client.release()
          }
        })
    )

    it.each(["cancel", "failure", "decision"] as const)(
      "pauses on an Agent and an Approval Request without deadlocking with a concurrent %s",
      async (kind) => {
        for (let round = 0; round < 8; round += 1) {
          await withFailing(async (fixture, parent) => {
            const root = await repositories.execution.getExecutionById(
              db,
              parent.executionId
            )
            const request =
              await repositories.approvalRequest.createApprovalRequest(db, {
                workspaceId: fixture.workspaceId,
                environmentId: fixture.environmentId,
                workflowId: root?.workflowId,
                executionId: parent.executionId,
                nodeId: "approval",
                audience: "external_subject",
                externalSubjectId: fixture.externalSubjectId,
                display: { title: "Continue?" },
              })
            const pause = () =>
              repositories.pauseClaim.claimPause(db, {
                workspaceId: fixture.workspaceId,
                executionId: parent.executionId,
                leasedBy: parent.executionClaimId,
                steps: [
                  { nodeId: "agent", kind: "agent" },
                  { nodeId: "approval", kind: "approval" },
                ],
              })
            const other = () => {
              if (kind === "cancel") return cancelExecution(parent)
              if (kind === "failure") return failParent(parent)
              return repositories.approvalRequest.decideExternalApprovalRequest(
                db,
                {
                  workspaceId: fixture.workspaceId,
                  environmentId: fixture.environmentId,
                  externalSubjectId: fixture.externalSubjectId,
                  endUserSessionId: fixture.endUserSessionId,
                  approvalRequestId: request?.id as string,
                  outcome: "approved",
                  idempotencyKey: randomUUID(),
                  now: new Date(),
                }
              )
            }
            const [claim] =
              round % 2 === 0
                ? await Promise.all([pause(), other()])
                : await Promise.all([other(), pause()]).then(([b, a]) => [a, b])
            const status = await statusOf(parent.executionId)
            const outcome = (claim as { outcome: string }).outcome
            if (kind === "cancel") {
              expect(status).toBe("cancelled")
            } else if (kind === "failure") {
              expect([status, outcome]).toEqual(
                outcome === "paused"
                  ? ["paused", "paused"]
                  : ["failed", "already-resolved"]
              )
            } else {
              expect([status, outcome]).toEqual(
                outcome === "paused"
                  ? ["queued", "paused"]
                  : ["running", "already-resolved"]
              )
            }
          })
        }
      },
      60_000
    )

    it.each(["decision", "claim", "cancel"] as const)(
      "does not deadlock with a concurrent %s, and leaves nothing open",
      async (kind) => {
        for (let round = 0; round < 8; round += 1) {
          await withFailing(async (fixture, parent) => {
            await invoke(fixture)
            if (kind === "claim") await decide(fixture, "approved")
            const claim = await claimOf(fixture)
            const other = () => {
              if (kind === "decision")
                return decide(fixture, "approved").catch((error: unknown) => {
                  expect(String(error)).toContain("cancelled")
                })
              if (kind === "claim")
                return repositories.actionIntent.claimApprovedActionIntent(
                  db,
                  claim
                )
              return cancelExecution(parent)
            }
            await Promise.all(
              round % 2 === 0
                ? [failParent(parent), other()]
                : [other(), failParent(parent)]
            )
            const { intent, approvalRequest } = await consent(fixture)
            const child = await statusOf(fixture.executionId)
            expect(["failed", "cancelled"]).toContain(
              await statusOf(parent.executionId)
            )
            expect(approvalRequest.status).not.toBe("pending")
            if (intent.status === "executing") expect(child).toBe("running")
            else {
              expect(intent.status).toBe("cancelled")
              expect(child).toBe("cancelled")
            }
          })
        }
      },
      60_000
    )
  })
})
