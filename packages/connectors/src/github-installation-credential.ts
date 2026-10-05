import { createPrivateKey, sign } from "node:crypto"
import { z } from "zod"
import { readBoundedJsonResponse } from "./bounded-response.js"
import {
  githubHeaders,
  githubRequestSignal,
  githubUrl,
  GithubProviderError,
} from "./github-api.js"
import type { ConnectorReadCredential } from "./connector-read-operation.js"

const permissionLevelSchema = z.enum(["read", "write"])
const permissionsSchema = z.record(z.string(), permissionLevelSchema)

export const githubInstallationCredentialSchema = z.strictObject({
  kind: z.literal("github_app_installation"),
  appClientId: z.string().min(1).max(64),
  privateKey: z.string().min(1).max(20000),
  installationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  accountId: z.string().min(1),
  accountLabel: z.string().min(1),
  permissions: permissionsSchema,
})

export type GithubInstallationCredential = z.infer<
  typeof githubInstallationCredentialSchema
>

function installationJwt(appClientId: string, privateKey: string): string {
  const key = createPrivateKey(privateKey)
  if (key.asymmetricKeyType !== "rsa")
    throw new Error("GitHub App requires an RSA private key")
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appClientId })
  ).toString("base64url")
  const unsigned = `${header}.${payload}`
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`
}

export function githubInstallationScopes(
  permissions: Record<string, "read" | "write">
): string[] {
  return Object.entries(permissions)
    .flatMap(([name, level]) =>
      level === "write" ? [`${name}:read`, `${name}:write`] : [`${name}:read`]
    )
    .sort((left, right) => left.localeCompare(right))
}

export async function authorizeGithubInstallation(input: {
  appClientId: string
  privateKey: string
  installationId: number
  permissions: Record<string, "read" | "write">
}): Promise<GithubInstallationCredential> {
  const response = await fetch(
    githubUrl(`/app/installations/${input.installationId}`),
    {
      headers: githubHeaders(
        installationJwt(input.appClientId, input.privateKey)
      ),
      signal: githubRequestSignal(),
      redirect: "error",
    }
  )
  if (!response.ok) throw new GithubProviderError(false)
  const installation = z
    .object({
      id: z.number().int(),
      app_id: z.number().int(),
      client_id: z.string().optional(),
      account: z.object({ login: z.string().min(1) }),
      permissions: permissionsSchema,
      suspended_at: z.string().nullable(),
    })
    .parse(await readBoundedJsonResponse(response, 1024 * 1024))
  if (
    installation.id !== input.installationId ||
    (String(installation.app_id) !== input.appClientId &&
      installation.client_id !== input.appClientId) ||
    installation.suspended_at !== null ||
    Object.entries(input.permissions).some(
      ([name, level]) =>
        installation.permissions[name] !== "write" &&
        installation.permissions[name] !== level
    )
  )
    throw new GithubProviderError(false)
  const credential = githubInstallationCredentialSchema.parse({
    ...input,
    kind: "github_app_installation",
    accountId: `installation:${installation.id}`,
    accountLabel: installation.account.login,
  })
  await resolveGithubInstallationCredential(credential)
  return credential
}

export async function resolveGithubInstallationCredential(
  credential: GithubInstallationCredential
): Promise<ConnectorReadCredential> {
  const response = await fetch(
    githubUrl(`/app/installations/${credential.installationId}/access_tokens`),
    {
      method: "POST",
      headers: {
        ...githubHeaders(
          installationJwt(credential.appClientId, credential.privateKey)
        ),
        "content-type": "application/json",
      },
      body: JSON.stringify({ permissions: credential.permissions }),
      signal: githubRequestSignal(),
      redirect: "error",
    }
  )
  if (!response.ok) throw new GithubProviderError(false)
  const result = z
    .object({
      token: z.string().min(1),
      expires_at: z.iso.datetime(),
      permissions: permissionsSchema,
    })
    .parse(await readBoundedJsonResponse(response, 1024 * 1024))
  if (
    Date.parse(result.expires_at) <= Date.now() ||
    Object.entries(credential.permissions).some(
      ([name, level]) =>
        result.permissions[name] !== "write" &&
        result.permissions[name] !== level
    )
  )
    throw new GithubProviderError(false)
  return {
    accountId: credential.accountId,
    accessToken: result.token,
    expiresAt: result.expires_at,
    scopes: githubInstallationScopes(credential.permissions),
    installationId: credential.installationId,
  }
}
