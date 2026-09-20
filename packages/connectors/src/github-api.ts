import { z } from "zod"
import type { ConnectorProviderError } from "./connector-side-effect-operation.js"

export const githubOwnerSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/)
export const githubRepositorySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/)
export const githubBranchSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._/-]+$/)
export const githubShaSchema = z.string().regex(/^[a-f0-9]{40}$/i)

export class GithubProviderError extends Error {
  constructor(
    readonly outcomeUnknown: boolean,
    readonly code = outcomeUnknown ? "outcome_unknown" : "provider_failed"
  ) {
    super(
      outcomeUnknown
        ? "GitHub provider outcome is unknown"
        : "GitHub provider request failed"
    )
  }
}

export function githubUrl(path: string): URL {
  return new URL(
    path,
    process.env.GITHUB_API_BASE_URL ?? "https://api.github.com"
  )
}

export function githubHeaders(accessToken: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": "Linea-Connector-Gateway",
    "x-github-api-version": "2026-03-10",
  }
}

export function githubRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(15_000)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export async function githubResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new GithubProviderError(response.ok)
  }
}

export function normalizeGithubProviderError(
  error: unknown
): ConnectorProviderError {
  if (error instanceof GithubProviderError) {
    return {
      code: error.code,
      message: error.message,
      outcomeUnknown: error.outcomeUnknown,
    }
  }
  return {
    code: "outcome_unknown",
    message: "GitHub provider outcome is unknown",
    outcomeUnknown: true,
  }
}

export function repositoryPath(owner: string, repository: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
}
