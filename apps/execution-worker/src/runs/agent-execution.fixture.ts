import { randomUUID } from "node:crypto"
import { db, encryptCredential, repositories, schema } from "@linea/db"
import {
  configureTestEnvironment,
  getTestApplicationId,
} from "@linea/db/testing"

export async function createAgentExecutionFixture() {
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: "Standalone Agent test",
      slug: `agent-execution-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const applicationId = await getTestApplicationId(db, workspace.id)
  const environment = await configureTestEnvironment(db, {
    workspaceId: workspace.id,
    applicationId,
    environment: "dev",
    displayName: "Agent test",
    allowedBrowserOrigins: ["http://127.0.0.1:4173"],
    allowedRedirectOrigins: ["http://127.0.0.1:4173"],
    oidcIssuer: "https://identity.example.com",
    oidcClientId: suffix,
    oidcAudience: suffix,
    oidcJwksUrl: "https://identity.example.com/jwks",
    connectorAccessPolicy: {
      providers: [
        {
          provider: "test",
          actionFamilies: ["test"],
          maxScopes: ["read:resources", "write:resources"],
        },
      ],
    },
  })
  const [subject] = await db
    .insert(schema.externalSubjects)
    .values({
      workspaceId: workspace.id,
      issuer: "https://identity.example.com",
      issuerSubject: suffix,
      status: "verified",
      verifiedAt: new Date(),
    })
    .returning()
  await db.insert(schema.externalSubjectEnvironments).values({
    workspaceId: workspace.id,
    environmentId: environment.id,
    externalSubjectId: subject.id,
  })
  const [session] = await db
    .insert(schema.endUserSessions)
    .values({
      workspaceId: workspace.id,
      environmentId: environment.id,
      externalSubjectId: subject.id,
      tokenHash: suffix,
      proofJkt: suffix,
      nonceHash: suffix,
      expiresAt: new Date(Date.now() + 600_000),
    })
    .returning()
  const connectionId = randomUUID()
  await db.insert(schema.connections).values({
    id: connectionId,
    workspaceId: workspace.id,
    environmentId: environment.id,
    externalSubjectId: subject.id,
    provider: "test",
    providerAccountId: suffix,
    accountLabel: "Deterministic account",
    status: "active",
    scopes: ["read:resources", "write:resources"],
    credentialEncrypted: encryptCredential(
      JSON.stringify({
        accountId: suffix,
        accessToken: "deterministic-credential",
        expiresAt: null,
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
  const agent = await repositories.agent.createAgent(db, {
    workspaceId: workspace.id,
    applicationId,
    name: "Standalone analyst",
    slug: suffix,
  })
  if (!agent) throw new Error("Agent fixture failed")
  const contract = await repositories.agentContract.createAgentContractRevision(
    db,
    workspace.id,
    agent.id,
    {
      inputSchema: { type: "object" },
      outputSchema: {
        type: "object",
        properties: { result: { type: "string" } },
        required: ["result"],
        additionalProperties: false,
      },
    }
  )
  if (contract.outcome !== "created") throw new Error("Contract fixture failed")
  const version = await repositories.agent.createAgentVersion(
    db,
    workspace.id,
    agent.id,
    {
      agentContractRevisionId: contract.revision.id,
      definition: {
        version: 1,
        instructions: "Create two independent actions",
        model: "gpt-5",
        tools: [
          { name: "update", operation: "deterministic.update" },
          { name: "read", operation: "deterministic.read" },
        ],
        maxIterations: 4,
      },
    }
  )
  if (version.outcome !== "created") throw new Error("Version fixture failed")
  await repositories.agent.publishAgentVersion(
    db,
    workspace.id,
    agent.id,
    version.version.id
  )
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    workspace.id,
    environment.id,
    agent.id,
    {
      agentVersionId: version.version.id,
      agentContractRevisionId: contract.revision.id,
      enabled: true,
    }
  )
  // Specs supply a deterministic platform model key rather than an Environment secret.
  await db
    .insert(schema.workspaceSettings)
    .values({ workspaceId: workspace.id, platformModelKeyEnabled: true })
  return {
    workspaceId: workspace.id,
    environmentId: environment.id,
    externalSubjectId: subject.id,
    sessionId: session.id,
    connectionId,
    agentId: agent.id,
    agentVersionId: version.version.id,
    contractId: contract.revision.id,
  }
}

export type AgentExecutionFixture = Awaited<
  ReturnType<typeof createAgentExecutionFixture>
>
