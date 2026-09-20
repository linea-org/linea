import { z } from "zod"
import type { ConnectorReadOperation } from "./connector-read-operation.js"
import {
  GithubProviderError,
  githubHeaders,
  githubRequestSignal,
  githubResponseJson,
  githubUrl,
} from "./github-api.js"

const inputSchema = z.strictObject({
  visibility: z.literal("public").default("public"),
  page: z.number().int().min(1).max(1_000).default(1),
  perPage: z.number().int().min(1).max(50).default(30),
})
const providerRepositorySchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  name: z.string().min(1).max(100),
  full_name: z.string().min(1).max(201),
  private: z.literal(false),
  html_url: z.url().max(2_000),
  default_branch: z.string().min(1).max(255),
  archived: z.boolean(),
  updated_at: z.iso.datetime(),
  owner: z.object({ login: z.string().min(1).max(100) }).passthrough(),
})
const outputRepositorySchema = z.strictObject({
  id: z.string().min(1).max(30),
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  fullName: z.string().min(1).max(201),
  private: z.literal(false),
  htmlUrl: z.url().max(2_000),
  defaultBranch: z.string().min(1).max(255),
  archived: z.boolean(),
  updatedAt: z.iso.datetime(),
})
const outputSchema = z.strictObject({
  repositories: z.array(outputRepositorySchema).max(50),
  page: z.number().int().min(1).max(1_000),
  perPage: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
})

export const githubListRepositoriesOperation: ConnectorReadOperation =
  Object.freeze<ConnectorReadOperation>({
    id: "github.repositories.list_public",
    provider: "github",
    actionFamily: "repositories",
    classification: "read",
    requiredScopes: Object.freeze(["read:user"]),
    providerErrorMessage: "GitHub repository read failed",
    inputSchema,
    outputSchema,
    async execute(rawInput, credential, signal) {
      const input = inputSchema.parse(rawInput)
      const url = githubUrl("/user/repos")
      url.searchParams.set("visibility", input.visibility)
      url.searchParams.set(
        "affiliation",
        "owner,collaborator,organization_member"
      )
      url.searchParams.set("sort", "updated")
      url.searchParams.set("direction", "desc")
      url.searchParams.set("page", String(input.page))
      url.searchParams.set("per_page", String(input.perPage))
      const response = await fetch(url, {
        headers: githubHeaders(credential.accessToken),
        signal: githubRequestSignal(signal),
      })
      if (!response.ok) throw new GithubProviderError(false)
      const repositories = z
        .array(providerRepositorySchema)
        .max(50)
        .parse(await githubResponseJson(response))
        .map((repository) => ({
          id: String(repository.id),
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          private: repository.private,
          htmlUrl: repository.html_url,
          defaultBranch: repository.default_branch,
          archived: repository.archived,
          updatedAt: repository.updated_at,
        }))
      return outputSchema.parse({
        repositories,
        page: input.page,
        perPage: input.perPage,
        hasMore: repositories.length === input.perPage,
      })
    },
  })
