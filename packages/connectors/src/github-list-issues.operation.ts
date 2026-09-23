import { z } from "zod"
import type { ConnectorReadOperation } from "./connector-read-operation.js"
import {
  GithubProviderError,
  githubHeaders,
  githubOwnerSchema,
  githubRequestSignal,
  githubRepositorySchema,
  githubResponseJson,
  githubUrl,
  repositoryPath,
} from "./github-api.js"

const inputSchema = z.strictObject({
  owner: githubOwnerSchema,
  repository: githubRepositorySchema,
  state: z.enum(["open", "closed", "all"]).default("open"),
  page: z.number().int().min(1).max(1_000).default(1),
  perPage: z.number().int().min(1).max(50).default(30),
})
const providerIssueSchema = z
  .object({
    id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    number: z.number().int().positive(),
    title: z.string().max(256),
    body: z.string().max(65_536).nullable(),
    state: z.enum(["open", "closed"]),
    html_url: z.url().max(2_000),
    user: z
      .object({ login: z.string().min(1).max(100) })
      .passthrough()
      .nullable(),
    labels: z
      .array(
        z.union([
          z.string().max(100),
          z.object({ name: z.string().max(100).nullable() }).passthrough(),
        ])
      )
      .max(100),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .passthrough()
const outputIssueSchema = z.strictObject({
  id: z.string().min(1).max(30),
  number: z.number().int().positive(),
  title: z.string().max(256),
  body: z.string().max(5_000).nullable(),
  bodyTruncated: z.boolean(),
  state: z.enum(["open", "closed"]),
  htmlUrl: z.url().max(2_000),
  author: z.string().min(1).max(100).nullable(),
  labels: z.array(z.string().max(100)).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
const outputSchema = z.strictObject({
  issues: z.array(outputIssueSchema).max(50),
  page: z.number().int().min(1).max(1_000),
  perPage: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
})

export const githubListIssuesOperation: ConnectorReadOperation =
  Object.freeze<ConnectorReadOperation>({
    id: "github.issues.list",
    provider: "github",
    actionFamily: "issues",
    classification: "read",
    requiredScopes: Object.freeze(["repo"]),
    providerErrorMessage: "GitHub issue read failed",
    inputSchema,
    outputSchema,
    async execute(rawInput, credential, signal) {
      const input = inputSchema.parse(rawInput)
      const url = githubUrl(
        `${repositoryPath(input.owner, input.repository)}/issues`
      )
      url.searchParams.set("state", input.state)
      url.searchParams.set("sort", "updated")
      url.searchParams.set("direction", "desc")
      url.searchParams.set("page", String(input.page))
      url.searchParams.set("per_page", String(input.perPage))
      const response = await fetch(url, {
        headers: githubHeaders(credential.accessToken),
        signal: githubRequestSignal(signal),
      })
      if (!response.ok) throw new GithubProviderError(false)
      const providerIssues = z
        .array(providerIssueSchema)
        .max(50)
        .parse(await githubResponseJson(response))
      const issues = providerIssues
        .filter((issue) => !("pull_request" in issue))
        .map((issue) => ({
          id: String(issue.id),
          number: issue.number,
          title: issue.title,
          body: issue.body?.slice(0, 5_000) ?? null,
          bodyTruncated: (issue.body?.length ?? 0) > 5_000,
          state: issue.state,
          htmlUrl: issue.html_url,
          author: issue.user?.login ?? null,
          labels: issue.labels.flatMap((label) => {
            const name = typeof label === "string" ? label : label.name
            return name ? [name] : []
          }),
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
        }))
      return outputSchema.parse({
        issues,
        page: input.page,
        perPage: input.perPage,
        hasMore: providerIssues.length === input.perPage,
      })
    },
  })
