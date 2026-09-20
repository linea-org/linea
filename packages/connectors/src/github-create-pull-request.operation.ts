import { createHash } from "node:crypto"
import { z } from "zod"
import type {
  ActionIntentEnvelope,
  ConnectorSideEffectOperation,
} from "./connector-side-effect-operation.js"
import {
  GithubProviderError,
  githubBranchSchema,
  githubHeaders,
  githubOwnerSchema,
  githubRequestSignal,
  githubRepositorySchema,
  githubResponseJson,
  githubShaSchema,
  githubUrl,
  normalizeGithubProviderError,
  repositoryPath,
} from "./github-api.js"
import { escapeSafeDisplayText } from "./safe-display.js"

const parameterFields = {
  owner: githubOwnerSchema,
  repository: githubRepositorySchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().max(500),
  head: githubBranchSchema,
  base: githubBranchSchema,
  draft: z.boolean(),
}
const inputSchema = z.strictObject({
  ...parameterFields,
  expectedHeadSha: githubShaSchema,
  expectedBaseSha: githubShaSchema,
})
const parametersSchema = z.strictObject(parameterFields)
const preconditionsSchema = z.strictObject({
  expectedHeadSha: githubShaSchema,
  expectedBaseSha: githubShaSchema,
})
const resultSchema = z.strictObject({
  id: z.string().min(1).max(30),
  number: z.number().int().positive(),
  title: z.string().max(256),
  state: z.enum(["open", "closed"]),
  htmlUrl: z.url().max(2_000),
  draft: z.boolean(),
  head: githubBranchSchema,
  base: githubBranchSchema,
})
const providerPullRequestSchema = z
  .object({
    id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    number: z.number().int().positive(),
    title: z.string().max(256),
    body: z.string().max(10_000).nullable(),
    state: z.enum(["open", "closed"]),
    html_url: z.url().max(2_000),
    draft: z.boolean(),
    head: z
      .object({ ref: githubBranchSchema, sha: githubShaSchema })
      .passthrough(),
    base: z
      .object({ ref: githubBranchSchema, sha: githubShaSchema })
      .passthrough(),
  })
  .passthrough()
const providerErrorSchema = z.strictObject({
  code: z.enum(["provider_failed", "outcome_unknown"]),
  message: z.string().max(200),
  outcomeUnknown: z.boolean(),
})

function actionMarker(invocationIdempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(invocationIdempotencyKey)
    .digest("base64url")
  return `<!-- linea-action:${digest} -->`
}

function requestBody(body: string, marker: string): string {
  return body ? `${body}\n\n${marker}` : marker
}

function normalizedPullRequest(
  pullRequest: z.infer<typeof providerPullRequestSchema>
) {
  return resultSchema.parse({
    id: String(pullRequest.id),
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    htmlUrl: pullRequest.html_url,
    draft: pullRequest.draft,
    head: pullRequest.head.ref,
    base: pullRequest.base.ref,
  })
}

async function repositoryRef(
  owner: string,
  repository: string,
  branch: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(
    githubUrl(
      `${repositoryPath(owner, repository)}/git/ref/heads/${branch
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    ),
    {
      headers: githubHeaders(accessToken),
      signal: githubRequestSignal(signal),
    }
  )
  if (!response.ok) throw new GithubProviderError(false)
  return z
    .object({ object: z.object({ sha: githubShaSchema }).passthrough() })
    .passthrough()
    .parse(await githubResponseJson(response)).object.sha
}

async function reconcilePullRequest(
  input: z.infer<typeof parametersSchema>,
  accessToken: string,
  marker: string,
  signal?: AbortSignal
) {
  const url = githubUrl(
    `${repositoryPath(input.owner, input.repository)}/pulls`
  )
  url.searchParams.set("state", "all")
  url.searchParams.set("head", `${input.owner}:${input.head}`)
  url.searchParams.set("base", input.base)
  url.searchParams.set("per_page", "20")
  const response = await fetch(url, {
    headers: githubHeaders(accessToken),
    signal: githubRequestSignal(signal),
  })
  if (!response.ok) throw new GithubProviderError(false)
  const pullRequests = z
    .array(providerPullRequestSchema)
    .max(20)
    .parse(await githubResponseJson(response))
  const match = pullRequests.find((pullRequest) =>
    pullRequest.body?.includes(marker)
  )
  return match ? normalizedPullRequest(match) : undefined
}

async function recoverAmbiguousPullRequest(
  input: z.infer<typeof parametersSchema>,
  accessToken: string,
  marker: string,
  signal?: AbortSignal
) {
  try {
    const reconciled = await reconcilePullRequest(
      input,
      accessToken,
      marker,
      signal
    )
    if (reconciled) return reconciled
  } catch {
    throw new GithubProviderError(true)
  }
  throw new GithubProviderError(true)
}

function parameters(envelope: ActionIntentEnvelope) {
  return parametersSchema.parse(envelope.parameters)
}

function preconditions(envelope: ActionIntentEnvelope) {
  return preconditionsSchema.parse(envelope.providerPreconditions)
}

export const githubCreatePullRequestOperation: ConnectorSideEffectOperation =
  Object.freeze<ConnectorSideEffectOperation>({
    id: "github.pull_requests.create",
    revision: "1",
    provider: "github",
    actionFamily: "pull_requests",
    classification: "side_effect",
    requiredScopes: Object.freeze(["repo"]),
    inputSchema,
    parametersSchema,
    preconditionsSchema,
    resultSchema,
    providerErrorSchema,
    retrySafety: "none",
    normalize(rawInput) {
      const input = inputSchema.parse(rawInput)
      return {
        target: {
          owner: input.owner.toLowerCase(),
          repository: input.repository.toLowerCase(),
        },
        parameters: {
          owner: input.owner.toLowerCase(),
          repository: input.repository.toLowerCase(),
          title: input.title,
          body: input.body,
          head: input.head,
          base: input.base,
          draft: input.draft,
        },
        providerPreconditions: {
          expectedHeadSha: input.expectedHeadSha,
          expectedBaseSha: input.expectedBaseSha,
        },
      }
    },
    display(envelope) {
      const input = parameters(envelope)
      const expected = preconditions(envelope)
      return {
        title: "Create GitHub pull request",
        details: {
          Repository: escapeSafeDisplayText(
            `${input.owner}/${input.repository}`
          ),
          Title: escapeSafeDisplayText(input.title),
          Body: escapeSafeDisplayText(input.body),
          Head: escapeSafeDisplayText(input.head),
          "Head commit": expected.expectedHeadSha,
          Base: escapeSafeDisplayText(input.base),
          "Base commit": expected.expectedBaseSha,
          Draft: input.draft ? "Yes" : "No",
        },
      }
    },
    async revalidateProviderPreconditions(
      rawParameters,
      rawPreconditions,
      credential,
      signal
    ) {
      const input = parametersSchema.parse(rawParameters)
      const preconditions = preconditionsSchema.parse(rawPreconditions)
      const [head, base] = await Promise.all([
        repositoryRef(
          input.owner,
          input.repository,
          input.head,
          credential.accessToken,
          signal
        ),
        repositoryRef(
          input.owner,
          input.repository,
          input.base,
          credential.accessToken,
          signal
        ),
      ])
      return (
        head === preconditions.expectedHeadSha &&
        base === preconditions.expectedBaseSha
      )
    },
    async execute(
      rawParameters,
      rawPreconditions,
      credential,
      invocationIdempotencyKey,
      signal
    ) {
      const input = parametersSchema.parse(rawParameters)
      preconditionsSchema.parse(rawPreconditions)
      const marker = actionMarker(invocationIdempotencyKey)
      const reconciled = await reconcilePullRequest(
        input,
        credential.accessToken,
        marker,
        signal
      )
      if (reconciled) return reconciled
      let response: Response
      try {
        response = await fetch(
          githubUrl(`${repositoryPath(input.owner, input.repository)}/pulls`),
          {
            method: "POST",
            headers: {
              ...githubHeaders(credential.accessToken),
              "content-type": "application/json",
            },
            body: JSON.stringify({
              title: input.title,
              body: requestBody(input.body, marker),
              head: input.head,
              base: input.base,
              draft: input.draft,
            }),
            signal: githubRequestSignal(signal),
          }
        )
      } catch {
        return recoverAmbiguousPullRequest(
          input,
          credential.accessToken,
          marker,
          signal
        )
      }
      if (response.ok) {
        try {
          return normalizedPullRequest(
            providerPullRequestSchema.parse(await githubResponseJson(response))
          )
        } catch {
          return recoverAmbiguousPullRequest(
            input,
            credential.accessToken,
            marker,
            signal
          )
        }
      }
      if (response.status >= 500) {
        return recoverAmbiguousPullRequest(
          input,
          credential.accessToken,
          marker,
          signal
        )
      }
      if (response.status === 422) {
        try {
          const afterFailure = await reconcilePullRequest(
            input,
            credential.accessToken,
            marker,
            signal
          )
          if (afterFailure) return afterFailure
        } catch {
          throw new GithubProviderError(true)
        }
      }
      throw new GithubProviderError(false)
    },
    normalizeProviderError: normalizeGithubProviderError,
  })
