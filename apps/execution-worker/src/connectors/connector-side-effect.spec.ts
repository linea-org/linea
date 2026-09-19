import "@linea/config/env"
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

type ProviderRequest = {
  authorization: string | undefined
  body: unknown
  idempotencyKey: string | undefined
  ifMatch: string | undefined
  path: string
}

type Provider = {
  server: Server
  baseUrl: string
  requests: ProviderRequest[]
}

type Fixture = {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  endUserSessionId: string
  connectionId: string
  executionId: string
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
  const body: unknown = JSON.parse(text)
  return body
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
  requests: ProviderRequest[],
  body: unknown
): void {
  const path = requestPath(request)
  requests.push({
    authorization: request.headers.authorization,
    body,
    idempotencyKey: singleHeader(request.headers["idempotency-key"]),
    ifMatch: singleHeader(request.headers["if-match"]),
    path,
  })
  const token = request.headers.authorization?.replace(/^Bearer /, "")
  if (!token?.startsWith("connector-secret-")) {
    response.writeHead(401).end()
    return
  }
  const resourceId = decodeURIComponent(path.replace("/resources/", ""))
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
  response.writeHead(200, { "content-type": "application/json" }).end(
    JSON.stringify({
      resourceId,
      value: (body as { value: string }).value,
      version: "version-two",
      accessToken: token,
      rawProviderField: "must not enter workflow state",
    })
  )
}

async function startProvider(): Promise<Provider> {
  const requests: ProviderRequest[] = []
  const server = createServer((request, response) => {
    void requestBody(request)
      .then((body) => respondToProvider(request, response, requests, body))
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
  const [application] = await db
    .insert(schema.applications)
    .values({
      workspaceId: workspace.id,
      environment: "dev",
      displayName: "Connector side effect application",
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
  const connectionId = randomUUID()
  const accessToken = `connector-secret-${randomUUID()}`
  await db.insert(schema.connections).values({
    id: connectionId,
    workspaceId: workspace.id,
    applicationId: application.id,
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
        applicationId: application.id,
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
      applicationId: application.id,
      externalSubjectId: subject.id,
      tokenHash: `token-${suffix}`,
      proofJkt: `proof-${suffix}`,
      nonceHash: `nonce-${suffix}`,
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: workspace.id,
    name: "Connector side effect workflow",
    slug: `connector-side-effect-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: graph(),
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
      connectionId,
      input: {
        resourceId,
        value: " <new value> ",
        secret: `private-${suffix}`,
        expectedVersion: "version-one",
      },
    },
  })
  if (start) {
    const started = await repositories.execution.startExecution(
      db,
      execution.id,
      `side-effect-test:${suffix}`,
      new Date(Date.now() + 60_000)
    )
    if (!started) throw new Error("Fixture Execution did not start")
  }
  return {
    workspaceId: workspace.id,
    applicationId: application.id,
    externalSubjectId: subject.id,
    endUserSessionId: session.id,
    connectionId,
    executionId: execution.id,
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
  return new RunsService(checkpoints, interpreter, new RunLeaseService())
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
      applicationId: fixture.applicationId,
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

async function removeWorkspace(workspaceId: string): Promise<void> {
  await pool.query("DELETE FROM approval_requests WHERE workspace_id = $1", [
    workspaceId,
  ])
  await pool.query("DELETE FROM organizations WHERE id = $1", [workspaceId])
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
      const executed = await invoke(fixture)
      expect(executed).toEqual({
        outcome: "completed",
        result: {
          resourceId: "record-one",
          value: "<new value>",
          version: "version-two",
        },
      })
      expect(provider.requests).toEqual([
        expect.objectContaining({
          body: { value: "<new value>", secret: fixture.input.secret },
          idempotencyKey: `${fixture.executionId}:action`,
          ifMatch: "version-one",
          path: "/resources/record-one",
        }),
      ])
      expect(JSON.stringify(executed)).not.toContain(fixture.input.secret)
      expect(JSON.stringify(executed)).not.toContain("rawProviderField")
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
      expect(provider.requests).toHaveLength(1)
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
            new Date(view.approvalRequest.expiresAt!.getTime() + 1)
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
        expect(provider.requests).toHaveLength(1)
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
})
