import { configureTestEnvironment } from '@linea/db/testing'
import { getTestApplicationId } from '@linea/db/testing'
import { createHash, randomUUID } from 'node:crypto'
import { googleAuthorizationScopes } from '@linea/connectors'
import { db, repositories, schema } from '@linea/db'
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose-v5'
import { generateEnvironmentKey } from '../src/auth/api-key.util'

type ProofKey = { privateKey: KeyLike; publicJwk: JWK }

export type LaunchSession = {
  externalSubjectId: string
  accessToken: string
  nonce: string
  key: ProofKey
}

export type LaunchFixture = {
  workspaceId: string
  environmentId: string
  environmentKey: string
  googleWorkflowId: string
  githubWorkflowId: string
  primary: LaunchSession
  secondDevice: LaunchSession
  otherSubject: LaunchSession
}

function hash(value: string, encoding: 'hex' | 'base64url'): string {
  return createHash('sha256').update(value).digest(encoding)
}

async function session(input: {
  workspaceId: string
  environmentId: string
  externalSubjectId: string
}): Promise<LaunchSession> {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const key = { privateKey, publicJwk: await exportJWK(publicKey) }
  const accessToken = `lnu_${randomUUID().replaceAll('-', '')}`
  const nonce = randomUUID()
  await db.insert(schema.endUserSessions).values({
    ...input,
    tokenHash: hash(accessToken, 'hex'),
    proofJkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
    nonceHash: hash(nonce, 'hex'),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  })
  return { externalSubjectId: input.externalSubjectId, accessToken, nonce, key }
}

async function subject(input: { workspaceId: string; environmentId: string }) {
  const [created] = await db
    .insert(schema.externalSubjects)
    .values({
      workspaceId: input.workspaceId,
      issuer: 'https://identity.example.com',
      issuerSubject: randomUUID(),
      status: 'verified',
      verifiedAt: new Date(),
    })
    .returning()
  await db.insert(schema.externalSubjectEnvironments).values({
    ...input,
    externalSubjectId: created.id,
  })
  return created.id
}

export async function createConnectionsLaunchFixture(): Promise<LaunchFixture> {
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(schema.organizations)
    .values({
      name: 'Connections launch gate',
      slug: `connections-launch-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const environment = await configureTestEnvironment(db, {
    applicationId: await getTestApplicationId(db, workspace.id),
    workspaceId: workspace.id,
    environment: 'dev',
    displayName: 'Connections launch environment',
    allowedBrowserOrigins: ['http://127.0.0.1:4173'],
    allowedRedirectOrigins: ['http://127.0.0.1:4173'],
    oidcIssuer: 'https://identity.example.com',
    oidcClientId: `connections-launch-${suffix}`,
    oidcAudience: `connections-launch-${suffix}`,
    oidcJwksUrl: 'https://identity.example.com/jwks',
    connectorAccessPolicy: {
      providers: [
        {
          provider: 'google',
          actionFamilies: ['gmail_read'],
          maxScopes: [...googleAuthorizationScopes(['gmail_read'])],
        },
        {
          provider: 'github',
          actionFamilies: ['issues'],
          maxScopes: ['read:user', 'repo'],
        },
      ],
    },
  })
  const workflows = new Map<string, string>()
  for (const [provider, operation] of [
    ['google', 'google.gmail.list_messages'],
    ['github', 'github.issues.create'],
  ]) {
    const workflow = await repositories.workflow.createWorkflow(db, {
      applicationId: await getTestApplicationId(db, workspace.id),
      workspaceId: workspace.id,
      name: `${provider} launch workflow`,
      slug: `${provider}-launch-${suffix}`,
    })
    const contract =
      await repositories.workflowContract.createWorkflowContractRevision(
        db,
        workspace.id,
        workflow.id,
        {
          inputSchema: {
            type: 'object',
            properties: {
              connectionId: { type: 'string' },
              input: { type: 'object' },
            },
            required: ['connectionId', 'input'],
            additionalProperties: false,
          },
          outputSchema: { type: 'object' },
        },
      )
    if (contract.outcome !== 'created')
      throw new Error('Contract creation failed')
    const version = await repositories.workflow.createWorkflowVersion(db, {
      workflowId: workflow.id,
      graph: {
        version: 1,
        trigger: { type: 'api' },
        entryNodeId: 'action',
        nodes: [
          { id: 'action', type: 'connector', config: { operation } },
          { id: 'end', type: 'end', config: {} },
        ],
        edges: [{ from: 'action', to: 'end' }],
      },
      contentHash: `${provider}-${suffix}`,
      workflowContractRevisionId: contract.revision.id,
    })
    await repositories.workflow.publishWorkflowVersion(
      db,
      workflow.id,
      version.id,
    )
    const binding =
      await repositories.environmentWorkflowBinding.putEnvironmentWorkflowBinding(
        db,
        workspace.id,
        environment.id,
        workflow.id,
        {
          workflowContractRevisionId: contract.revision.id,
          workflowVersionId: version.id,
          allowBackendStart: false,
          allowEndUserStart: true,
          enabled: true,
        },
      )
    if (binding.outcome !== 'updated')
      throw new Error('Workflow binding failed')
    workflows.set(provider, workflow.id)
  }
  const primarySubjectId = await subject({
    workspaceId: workspace.id,
    environmentId: environment.id,
  })
  const otherSubjectId = await subject({
    workspaceId: workspace.id,
    environmentId: environment.id,
  })
  const generatedKey = generateEnvironmentKey()
  await db.insert(schema.environmentKeys).values({
    workspaceId: workspace.id,
    environmentId: environment.id,
    name: 'Connections launch gate',
    scopes: ['audit:read', 'executions:read', 'executions:cancel'],
    hashedKey: generatedKey.hashedKey,
    keyPrefix: generatedKey.keyPrefix,
  })
  const googleWorkflowId = workflows.get('google')
  const githubWorkflowId = workflows.get('github')
  if (!googleWorkflowId || !githubWorkflowId)
    throw new Error('Workflows missing')
  return {
    workspaceId: workspace.id,
    environmentId: environment.id,
    environmentKey: generatedKey.rawKey,
    googleWorkflowId,
    githubWorkflowId,
    primary: await session({
      workspaceId: workspace.id,
      environmentId: environment.id,
      externalSubjectId: primarySubjectId,
    }),
    secondDevice: await session({
      workspaceId: workspace.id,
      environmentId: environment.id,
      externalSubjectId: primarySubjectId,
    }),
    otherSubject: await session({
      workspaceId: workspace.id,
      environmentId: environment.id,
      externalSubjectId: otherSubjectId,
    }),
  }
}

export async function sessionHeaders(
  baseUrl: string,
  session: LaunchSession,
  method: string,
  path: string,
): Promise<Record<string, string>> {
  const proof = await new SignJWT({
    jti: randomUUID(),
    htm: method,
    htu: `${baseUrl}${path}`,
    iat: Math.floor(Date.now() / 1_000),
    nonce: session.nonce,
    ath: hash(session.accessToken, 'base64url'),
  })
    .setProtectedHeader({
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: session.key.publicJwk,
    })
    .sign(session.key.privateKey)
  return { Authorization: `DPoP ${session.accessToken}`, DPoP: proof }
}
