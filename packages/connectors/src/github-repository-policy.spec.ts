import { beforeEach, describe, expect, it, vi } from "vitest"
import { generateKeyPairSync } from "node:crypto"
import { db, decryptCredential, repositories } from "@linea/db"
import { ConnectorGateway } from "./connector-gateway.js"
import { githubListIssuesOperation } from "./github-list-issues.operation.js"
import { githubListRepositoriesOperation } from "./github-list-repositories.operation.js"
import { githubCreateIssueOperation } from "./github-create-issue.operation.js"
import { githubCreatePullRequestOperation } from "./github-create-pull-request.operation.js"

vi.mock("@linea/db", () => ({
  db: {},
  decryptCredential: vi.fn(() =>
    JSON.stringify({
      accountId: "account",
      accessToken: "secret",
      expiresAt: null,
    })
  ),
  repositories: {
    connection: {
      getConnectorReadAuthority: vi.fn(),
      recordConnectionReadUse: vi.fn(),
    },
    actionIntent: {
      createActionIntent: vi.fn(),
      getActionIntentConsent: vi.fn(),
    },
  },
}))

type Authority = NonNullable<
  Awaited<ReturnType<typeof repositories.connection.getConnectorReadAuthority>>
>
function authority(): Authority {
  return {
    connection: {
      id: "connection",
      workspaceId: "workspace",
      environmentId: "environment",
      externalSubjectId: "subject",
      ownership: "personal",
      authorizationKind: "delegated_user",
      provider: "github",
      providerAccountId: "account",
      accountLabel: "Account",
      status: "active",
      scopes: ["repo", "read:user"],
      credentialEncrypted: "encrypted",
      credentialVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    },
    externalSubjectId: "subject",
    providerPolicy: {
      provider: "github",
      actionFamilies: ["issues", "pull_requests", "repositories"],
      maxScopes: ["repo", "read:user"],
      allowedRepositories: [{ owner: "ACME", repository: "Widgets" }],
    },
  }
}
const gateway = new ConnectorGateway(db, {
  [githubListIssuesOperation.id]: githubListIssuesOperation,
  [githubListRepositoriesOperation.id]: githubListRepositoriesOperation,
  [githubCreateIssueOperation.id]: githubCreateIssueOperation,
  [githubCreatePullRequestOperation.id]: githubCreatePullRequestOperation,
})
const input = {
  executionId: "execution",
  workspaceId: "workspace",
  connectionId: "connection",
  nodeId: "node",
  invocationIdempotencyKey: "invocation",
  executionClaimId: "claim",
  operationId: githubListIssuesOperation.id,
  operationInput: { owner: "acme", repository: "widgets" },
}
const provider = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", provider)
  vi.mocked(
    repositories.connection.getConnectorReadAuthority
  ).mockResolvedValue(authority())
})
describe("Gateway GitHub repository policy", () => {
  it.each([
    githubListIssuesOperation.id,
    githubCreateIssueOperation.id,
    githubCreatePullRequestOperation.id,
  ])("blocks %s before provider calls or consent", async (operationId) => {
    await expect(
      gateway.execute({
        ...input,
        operationId,
        operationInput:
          operationId === githubListIssuesOperation.id
            ? { owner: "acme", repository: "private" }
            : operationId === githubCreateIssueOperation.id
              ? {
                  owner: "acme",
                  repository: "private",
                  title: "Title",
                  body: "Body",
                  labels: [],
                  assignees: [],
                }
              : {
                  owner: "acme",
                  repository: "private",
                  title: "Title",
                  body: "Body",
                  head: "feature",
                  base: "main",
                  draft: false,
                  expectedHeadSha: "a".repeat(40),
                  expectedBaseSha: "b".repeat(40),
                },
      })
    ).rejects.toThrow("Connector target not allowed")
    expect(provider).not.toHaveBeenCalled()
    expect(repositories.actionIntent.createActionIntent).not.toHaveBeenCalled()
  })
  it.each([undefined, []])(
    "denies unconfigured or empty policies: %s",
    async (allowedRepositories) => {
      const current = authority()
      current.providerPolicy.allowedRepositories = allowedRepositories
      vi.mocked(
        repositories.connection.getConnectorReadAuthority
      ).mockResolvedValue(current)
      await expect(gateway.execute(input)).rejects.toThrow(
        "Connector target not allowed"
      )
      await expect(
        gateway.execute({
          ...input,
          operationId: githubListRepositoriesOperation.id,
          operationInput: {},
        })
      ).rejects.toThrow("Connector target not allowed")
      expect(provider).not.toHaveBeenCalled()
      expect(
        repositories.actionIntent.createActionIntent
      ).not.toHaveBeenCalled()
    }
  )
  it("denies an installation target before minting a token", async () => {
    const current = authority()
    current.connection.ownership = "environment"
    current.connection.authorizationKind = "github_app_installation"
    current.connection.scopes = ["issues:read"]
    current.providerPolicy.maxScopes = ["issues:read"]
    vi.mocked(
      repositories.connection.getConnectorReadAuthority
    ).mockResolvedValue(current)
    await expect(
      gateway.execute({
        ...input,
        operationInput: { owner: "acme", repository: "private" },
      })
    ).rejects.toThrow("Connector target not allowed")
    expect(decryptCredential).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })
  it("rechecks installation policy after token minting", async () => {
    const current = authority()
    current.connection.ownership = "environment"
    current.connection.authorizationKind = "github_app_installation"
    current.connection.scopes = ["issues:read"]
    current.providerPolicy.maxScopes = ["issues:read"]
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    vi.mocked(decryptCredential).mockReturnValue(
      JSON.stringify({
        kind: "github_app_installation",
        appClientId: "1",
        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
        installationId: 42,
        accountId: "account",
        accountLabel: "Account",
        permissions: { issues: "read" },
      })
    )
    vi.mocked(
      repositories.connection.getConnectorReadAuthority
    ).mockResolvedValue(current)
    provider.mockImplementation(async () => {
      current.providerPolicy.allowedRepositories = []
      return new Response(
        JSON.stringify({
          token: "token",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          permissions: { issues: "read" },
        })
      )
    })
    await expect(gateway.execute(input)).rejects.toThrow(
      "Connector target not allowed"
    )
    expect(provider).toHaveBeenCalledTimes(1)
    expect(provider.mock.calls[0]?.[0]).toBeInstanceOf(URL)
    const url = provider.mock.calls[0]?.[0]
    if (!(url instanceof URL)) throw new Error("Expected a provider URL")
    expect(url.pathname).toContain("/access_tokens")
  })
  it("allows a case-insensitive repository read", async () => {
    provider.mockResolvedValue(new Response("[]"))
    await expect(gateway.execute(input)).resolves.toMatchObject({
      outcome: "completed",
      result: { issues: [] },
    })
    expect(provider).toHaveBeenCalledTimes(1)
  })
  it("allows a matching write to reach the intent boundary", async () => {
    vi.mocked(repositories.actionIntent.createActionIntent).mockResolvedValue({
      outcome: "authority_invalid",
    })
    await expect(
      gateway.execute({
        ...input,
        operationId: githubCreateIssueOperation.id,
        operationInput: {
          ...input.operationInput,
          title: "Title",
          body: "Body",
          labels: [],
          assignees: [],
        },
      })
    ).rejects.toThrow()
    expect(repositories.actionIntent.createActionIntent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        target: { owner: "acme", repository: "widgets" },
      })
    )
    expect(provider).not.toHaveBeenCalled()
  })
  it.each(["policy", "revocation"])(
    "rechecks %s before provider access",
    async (change) => {
      const current = authority()
      if (change === "policy") current.providerPolicy.allowedRepositories = []
      else current.connection.status = "revoked"
      vi.mocked(repositories.connection.getConnectorReadAuthority)
        .mockResolvedValueOnce(authority())
        .mockResolvedValue(current)
      await expect(gateway.execute(input)).rejects.toThrow()
      expect(provider).not.toHaveBeenCalled()
    }
  )
  it("does not release a read when policy is removed during the provider request", async () => {
    provider.mockImplementation(async () => {
      const current = authority()
      current.providerPolicy.allowedRepositories = []
      vi.mocked(
        repositories.connection.getConnectorReadAuthority
      ).mockResolvedValue(current)
      return new Response("[]")
    })
    await expect(gateway.execute(input)).rejects.toThrow(
      "Connector target not allowed"
    )
  })
  it("filters listing rows and suppresses provider pagination disclosure", async () => {
    const repository = {
      id: 1,
      name: "Widgets",
      full_name: "Acme/Widgets",
      private: false,
      html_url: "https://github.com/Acme/Widgets",
      default_branch: "main",
      archived: false,
      updated_at: "2026-11-12T00:00:00Z",
      owner: { login: "Acme" },
    }
    provider.mockResolvedValue(
      new Response(
        JSON.stringify([
          repository,
          { ...repository, id: 2, name: "secret", full_name: "Acme/secret" },
        ])
      )
    )
    const result = await gateway.execute({
      ...input,
      operationId: githubListRepositoriesOperation.id,
      operationInput: { perPage: 2 },
    })
    expect(result).toMatchObject({
      outcome: "completed",
      result: { repositories: [{ name: "Widgets" }], hasMore: false },
    })
    if (result.outcome !== "completed") throw new Error("Read did not complete")
    expect(JSON.stringify(result.result)).not.toContain("secret")
  })
})
