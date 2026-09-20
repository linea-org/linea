import { z } from "zod"
import type {
  ActionIntentEnvelope,
  ConnectorSideEffectOperation,
} from "./connector-side-effect-operation.js"
import {
  GithubProviderError,
  githubHeaders,
  githubOwnerSchema,
  githubRequestSignal,
  githubRepositorySchema,
  githubResponseJson,
  githubUrl,
  normalizeGithubProviderError,
  repositoryPath,
} from "./github-api.js"
import { escapeSafeDisplayText } from "./safe-display.js"

const issueFields = {
  owner: githubOwnerSchema,
  repository: githubRepositorySchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().max(500),
  labels: z
    .array(z.string().min(1).max(50))
    .max(5)
    .transform((labels) =>
      [...new Set(labels)].sort((left, right) => left.localeCompare(right))
    ),
  assignees: z
    .array(
      z
        .string()
        .min(1)
        .max(39)
        .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/)
    )
    .max(5)
    .transform((assignees) =>
      [...new Set(assignees)].sort((left, right) => left.localeCompare(right))
    ),
}
const inputSchema = z.strictObject(issueFields)
const parametersSchema = z.strictObject(issueFields)
const preconditionsSchema = z.strictObject({})
const resultSchema = z.strictObject({
  id: z.string().min(1).max(30),
  number: z.number().int().positive(),
  title: z.string().max(256),
  state: z.enum(["open", "closed"]),
  htmlUrl: z.url().max(2_000),
})
const providerResponseSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  number: z.number().int().positive(),
  title: z.string().max(256),
  state: z.enum(["open", "closed"]),
  html_url: z.url().max(2_000),
})
const providerErrorSchema = z.strictObject({
  code: z.enum(["provider_failed", "outcome_unknown"]),
  message: z.string().max(200),
  outcomeUnknown: z.boolean(),
})

function parameters(envelope: ActionIntentEnvelope) {
  return parametersSchema.parse(envelope.parameters)
}

export const githubCreateIssueOperation: ConnectorSideEffectOperation =
  Object.freeze<ConnectorSideEffectOperation>({
    id: "github.issues.create",
    revision: "1",
    provider: "github",
    actionFamily: "issues",
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
          ...input,
          owner: input.owner.toLowerCase(),
          repository: input.repository.toLowerCase(),
        },
        providerPreconditions: {},
      }
    },
    display(envelope) {
      const input = parameters(envelope)
      return {
        title: "Create GitHub issue",
        details: {
          Repository: escapeSafeDisplayText(
            `${input.owner}/${input.repository}`
          ),
          Title: escapeSafeDisplayText(input.title),
          Body: escapeSafeDisplayText(input.body),
          Labels: escapeSafeDisplayText(input.labels.join(", ") || "None"),
          Assignees: escapeSafeDisplayText(
            input.assignees.join(", ") || "None"
          ),
        },
      }
    },
    async revalidateProviderPreconditions(rawParameters, rawPreconditions) {
      parametersSchema.parse(rawParameters)
      preconditionsSchema.parse(rawPreconditions)
      return true
    },
    async execute(
      rawParameters,
      rawPreconditions,
      credential,
      _invocationIdempotencyKey,
      signal
    ) {
      const input = parametersSchema.parse(rawParameters)
      preconditionsSchema.parse(rawPreconditions)
      let response: Response
      try {
        response = await fetch(
          githubUrl(`${repositoryPath(input.owner, input.repository)}/issues`),
          {
            method: "POST",
            headers: {
              ...githubHeaders(credential.accessToken),
              "content-type": "application/json",
            },
            body: JSON.stringify({
              title: input.title,
              body: input.body,
              labels: input.labels,
              assignees: input.assignees,
            }),
            signal: githubRequestSignal(signal),
          }
        )
      } catch {
        throw new GithubProviderError(true)
      }
      if (!response.ok) {
        throw new GithubProviderError(response.status >= 500)
      }
      let providerResult: z.infer<typeof providerResponseSchema>
      try {
        providerResult = providerResponseSchema.parse(
          await githubResponseJson(response)
        )
      } catch {
        throw new GithubProviderError(true)
      }
      return resultSchema.parse({
        id: String(providerResult.id),
        number: providerResult.number,
        title: providerResult.title,
        state: providerResult.state,
        htmlUrl: providerResult.html_url,
      })
    },
    normalizeProviderError: normalizeGithubProviderError,
  })
