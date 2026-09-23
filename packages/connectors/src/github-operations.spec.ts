import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { githubCreateIssueOperation } from "./github-create-issue.operation.js"
import { githubCreatePullRequestOperation } from "./github-create-pull-request.operation.js"
import { githubListIssuesOperation } from "./github-list-issues.operation.js"
import { githubListRepositoriesOperation } from "./github-list-repositories.operation.js"

type RecordedRequest = {
  method: string
  path: string
  query: URLSearchParams
  headers: IncomingMessage["headers"]
  body: unknown
}

const requests: RecordedRequest[] = []
let repositoryVersion = {
  head: "1111111111111111111111111111111111111111",
  base: "2222222222222222222222222222222222222222",
}
let createdIssue = false
let createdPullRequest = false
let createdPullRequestState: "open" | "closed" = "open"
let loseNextIssueResponse = false
let createdPullRequestBody = ""

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json",
    "x-github-request-id": "secret-request-id",
  })
  response.end(JSON.stringify(body))
}

function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined)
        return
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
      resolve(parsed)
    })
    request.on("error", reject)
  })
}

function issueResponse(number: number) {
  return {
    id: 9000 + number,
    node_id: `I_${number}`,
    number,
    title: "Provider title",
    body: "Provider body",
    state: "open",
    html_url: `https://github.test/acme/widgets/issues/${number}`,
    user: { login: "octocat" },
    labels: [{ name: "bug" }],
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:01:00Z",
    raw_secret: "must-not-leak",
  }
}

describe("GitHub Connector Operations", () => {
  let baseUrl: string
  let closeProvider: () => Promise<void>
  beforeAll(async () => {
    const server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1")
        const requestBody = await body(request)
        requests.push({
          method: request.method ?? "GET",
          path: url.pathname,
          query: url.searchParams,
          headers: request.headers,
          body: requestBody,
        })
        if (request.headers.authorization !== "Bearer github-access-secret") {
          json(response, 401, { message: "bad github-access-secret" })
          return
        }
        if (request.method === "GET" && url.pathname === "/user/repos") {
          json(response, 200, [
            {
              id: 101,
              node_id: "R_101",
              name: "widgets",
              full_name: "acme/widgets",
              private: false,
              html_url: "https://github.test/acme/widgets",
              default_branch: "main",
              archived: false,
              updated_at: "2026-09-20T00:00:00Z",
              owner: { login: "acme" },
              raw_secret: "must-not-leak",
            },
          ])
          return
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/acme/widgets/issues"
        ) {
          const issue = issueResponse(createdIssue ? 43 : 42)
          if (createdIssue)
            issue.body = "Create this\n\n<!-- linea-action:marker -->"
          json(response, 200, [
            issue,
            { ...issueResponse(99), pull_request: {} },
          ])
          return
        }
        if (
          request.method === "POST" &&
          url.pathname === "/repos/acme/widgets/issues"
        ) {
          createdIssue = true
          if (loseNextIssueResponse) {
            loseNextIssueResponse = false
            request.socket.destroy()
            return
          }
          json(response, 201, issueResponse(43))
          return
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/acme/widgets/git/ref/heads/feature"
        ) {
          json(response, 200, { object: { sha: repositoryVersion.head } })
          return
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/acme/widgets/git/ref/heads/main"
        ) {
          json(response, 200, { object: { sha: repositoryVersion.base } })
          return
        }
        if (
          request.method === "GET" &&
          url.pathname === "/repos/acme/widgets/pulls"
        ) {
          const requestedState = url.searchParams.get("state")
          const visible =
            createdPullRequest &&
            (requestedState === "all" ||
              requestedState === createdPullRequestState)
          json(
            response,
            200,
            visible
              ? [
                  {
                    id: 501,
                    node_id: "PR_501",
                    number: 7,
                    title: "Ship it",
                    body: createdPullRequestBody,
                    state: createdPullRequestState,
                    html_url: "https://github.test/acme/widgets/pull/7",
                    draft: false,
                    head: { ref: "feature", sha: repositoryVersion.head },
                    base: { ref: "main", sha: repositoryVersion.base },
                  },
                ]
              : []
          )
          return
        }
        if (
          request.method === "POST" &&
          url.pathname === "/repos/acme/widgets/pulls"
        ) {
          createdPullRequest = true
          if (
            requestBody &&
            typeof requestBody === "object" &&
            "body" in requestBody &&
            typeof requestBody.body === "string"
          ) {
            createdPullRequestBody = requestBody.body
          }
          json(response, 504, { message: "github-access-secret" })
          return
        }
        json(response, 404, { message: "missing" })
      })()
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No address")
    baseUrl = `http://127.0.0.1:${address.port}`
    process.env.GITHUB_API_BASE_URL = baseUrl
    closeProvider = () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
  })
  afterAll(async () => {
    await closeProvider()
    delete process.env.GITHUB_API_BASE_URL
  })
  const credential = {
    accountId: "1234",
    accessToken: "github-access-secret",
    expiresAt: null,
    scopes: ["read:user", "repo"],
  }
  it("returns a bounded repository page without raw provider fields or headers", async () => {
    expect(githubListRepositoriesOperation).toMatchObject({
      classification: "read",
      provider: "github",
      actionFamily: "repositories",
      requiredScopes: ["read:user"],
    })
    const result = await githubListRepositoriesOperation.execute(
      { visibility: "public", page: 2, perPage: 10 },
      credential
    )
    expect(result).toEqual({
      repositories: [
        {
          id: "101",
          owner: "acme",
          name: "widgets",
          fullName: "acme/widgets",
          private: false,
          htmlUrl: "https://github.test/acme/widgets",
          defaultBranch: "main",
          archived: false,
          updatedAt: "2026-09-20T00:00:00Z",
        },
      ],
      page: 2,
      perPage: 10,
      hasMore: false,
    })
    expect(JSON.stringify(result)).not.toContain("secret")
    const sent = requests.at(-1)
    expect(sent?.query.get("per_page")).toBe("10")
    expect(sent?.headers["x-github-api-version"]).toBeTruthy()
  })
  it("returns bounded issues and excludes pull requests", async () => {
    expect(githubListIssuesOperation).toMatchObject({
      classification: "read",
      provider: "github",
      actionFamily: "issues",
      requiredScopes: ["repo"],
    })
    const result = await githubListIssuesOperation.execute(
      {
        owner: "acme",
        repository: "widgets",
        state: "open",
        page: 1,
        perPage: 5,
      },
      credential
    )
    expect(result).toEqual({
      issues: [
        {
          id: "9042",
          number: 42,
          title: "Provider title",
          body: "Provider body",
          bodyTruncated: false,
          state: "open",
          htmlUrl: "https://github.test/acme/widgets/issues/42",
          author: "octocat",
          labels: ["bug"],
          createdAt: "2026-09-20T00:00:00Z",
          updatedAt: "2026-09-20T00:01:00Z",
        },
      ],
      page: 1,
      perPage: 5,
      hasMore: false,
    })
    expect(JSON.stringify(result)).not.toContain("raw_secret")
  })
  it("owns exact issue parameters and reports a possibly sent request as unknown", async () => {
    const normalized = githubCreateIssueOperation.normalize({
      owner: "acme",
      repository: "widgets",
      title: "  Create this  ",
      body: "Create this",
      labels: ["éclair", "Zulu", "alpha", "éclair"],
      assignees: ["octocat", "Alpha", "octocat"],
    })
    expect(normalized).toEqual({
      target: { owner: "acme", repository: "widgets" },
      parameters: {
        owner: "acme",
        repository: "widgets",
        title: "Create this",
        body: "Create this",
        labels: ["Zulu", "alpha", "éclair"],
        assignees: ["Alpha", "octocat"],
      },
      providerPreconditions: {},
    })
    const display = githubCreateIssueOperation.display({
      version: 1,
      operationRevision: "1",
      connectionId: "connection",
      connector: "github",
      operation: githubCreateIssueOperation.id,
      target: normalized.target,
      parameters: normalized.parameters,
      providerPreconditions: normalized.providerPreconditions,
    })
    expect(display).toMatchObject({
      title: "Create GitHub issue",
      details: { Repository: "acme/widgets", Title: "Create this" },
    })
    await expect(
      githubCreateIssueOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        credential,
        "issue-success-key"
      )
    ).resolves.toEqual({
      id: "9043",
      number: 43,
      title: "Provider title",
      state: "open",
      htmlUrl: "https://github.test/acme/widgets/issues/43",
    })
    loseNextIssueResponse = true
    await expect(
      githubCreateIssueOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        credential,
        "issue-idempotency-key"
      )
    ).rejects.toMatchObject({ outcomeUnknown: true })
    expect(githubCreateIssueOperation.retrySafety).toBe("none")
    expect(githubCreateIssueOperation).toMatchObject({
      classification: "side_effect",
      requiredScopes: ["repo"],
    })
  })
  it("revalidates pull request refs and reconciles an ambiguous create", async () => {
    repositoryVersion = {
      head: "a".repeat(40),
      base: "b".repeat(40),
    }
    const normalized = githubCreatePullRequestOperation.normalize({
      owner: "acme",
      repository: "widgets",
      title: "Ship it",
      body: "Ready",
      head: "feature",
      base: "main",
      draft: false,
      expectedHeadSha: repositoryVersion.head.toUpperCase(),
      expectedBaseSha: repositoryVersion.base.toUpperCase(),
    })
    expect(normalized.providerPreconditions).toEqual({
      expectedHeadSha: repositoryVersion.head,
      expectedBaseSha: repositoryVersion.base,
    })
    expect(
      githubCreatePullRequestOperation.display({
        version: 1,
        operationRevision: "1",
        connectionId: "connection",
        connector: "github",
        operation: githubCreatePullRequestOperation.id,
        target: normalized.target,
        parameters: normalized.parameters,
        providerPreconditions: normalized.providerPreconditions,
      })
    ).toMatchObject({
      details: {
        "Head commit": repositoryVersion.head,
        "Base commit": repositoryVersion.base,
      },
    })
    await expect(
      githubCreatePullRequestOperation.revalidateProviderPreconditions(
        normalized.parameters,
        normalized.providerPreconditions,
        credential
      )
    ).resolves.toBe(true)
    repositoryVersion = { ...repositoryVersion, head: "3".repeat(40) }
    await expect(
      githubCreatePullRequestOperation.revalidateProviderPreconditions(
        normalized.parameters,
        normalized.providerPreconditions,
        credential
      )
    ).resolves.toBe(false)
    repositoryVersion = {
      head: "a".repeat(40),
      base: "b".repeat(40),
    }
    await expect(
      githubCreatePullRequestOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        credential,
        "pull-idempotency-key"
      )
    ).resolves.toEqual({
      id: "501",
      number: 7,
      title: "Ship it",
      state: "open",
      htmlUrl: "https://github.test/acme/widgets/pull/7",
      draft: false,
      head: "feature",
      base: "main",
    })
    createdPullRequestState = "closed"
    repositoryVersion = {
      head: "3".repeat(40),
      base: "4".repeat(40),
    }
    await expect(
      githubCreatePullRequestOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        credential,
        "pull-idempotency-key"
      )
    ).resolves.toMatchObject({ number: 7, state: "closed" })
    const pullCreates = requests.filter(
      (request) =>
        request.method === "POST" &&
        request.path === "/repos/acme/widgets/pulls"
    )
    expect(pullCreates).toHaveLength(1)
    expect(
      requests
        .filter((request) => request.path === "/repos/acme/widgets/pulls")
        .at(-1)
        ?.query.get("state")
    ).toBe("all")
    expect(JSON.stringify(pullCreates[0]?.body)).not.toContain(
      "pull-idempotency-key"
    )
    expect(githubCreatePullRequestOperation.retrySafety).toBe("none")
  })
})
