import { RequestMethod, type Type } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants'
import { operationRegistry } from '@linea/protocol'
import { AgentContractsController } from '../agents/agent-contracts.controller'
import { AgentsController } from '../agents/agents.controller'
import { ApplicationsController } from '../applications/applications.controller'
import { ApprovalsController } from '../approvals/approvals.controller'
import { EnvironmentConnectionsController } from '../connections/environment-connections.controller'
import { ConversationAnalysesController } from '../conversation-analyses/conversation-analyses.controller'
import { EnvironmentAgentBindingsController } from '../environments/environment-agent-bindings.controller'
import { EnvironmentKeysController } from '../environments/environment-keys.controller'
import { EnvironmentWebhooksController } from '../environments/environment-webhooks.controller'
import { EnvironmentWorkflowBindingsController } from '../environments/environment-workflow-bindings.controller'
import { EnvironmentsController } from '../environments/environments.controller'
import { ExternalSubjectsController } from '../environments/external-subjects.controller'
import { ExecutionsController } from '../executions/executions.controller'
import { NotificationsController } from '../notifications/notifications.controller'
import { WorkspaceConnectorAuditController } from '../public-runtime/workspace-connector-audit.controller'
import { RegressionCasesController } from '../regressions/regression-cases.controller'
import { RegressionRunsController } from '../regressions/regression-runs.controller'
import { SecretsController } from '../secrets/secrets.controller'
import { SignalsController } from '../signals/signals.controller'
import { TriggersController } from '../triggers/triggers.controller'
import { WorkflowContractsController } from '../workflows/workflow-contracts.controller'
import { WorkflowsController } from '../workflows/workflows.controller'
import { WORKSPACE_KEY_SCOPES_KEY } from './require-workspace-key-scopes.decorator'
import { WorkspaceAuthGuard } from './workspace-auth.guard'

const controllers: Type[] = [
  AgentContractsController,
  AgentsController,
  ApplicationsController,
  ApprovalsController,
  EnvironmentConnectionsController,
  ConversationAnalysesController,
  EnvironmentAgentBindingsController,
  EnvironmentKeysController,
  EnvironmentWebhooksController,
  EnvironmentWorkflowBindingsController,
  EnvironmentsController,
  ExternalSubjectsController,
  ExecutionsController,
  NotificationsController,
  WorkspaceConnectorAuditController,
  RegressionCasesController,
  RegressionRunsController,
  SecretsController,
  SignalsController,
  TriggersController,
  WorkflowContractsController,
  WorkflowsController,
]

// The complete list of routes a workspace API key can reach; anything else is session-only.
const expectedKeyRoutes: Record<string, string[]> = {
  'GET /applications': ['applications:read'],
  'GET /applications/:id': ['applications:read'],
  'GET /applications/:id/environments': ['applications:read'],
  'GET /applications/:id/workflows': ['applications:read'],
  'GET /audit-events': ['audit:read'],
  'GET /executions': ['executions:read'],
  'GET /executions/new-count': ['executions:read'],
  'GET /signals': ['signals:read'],
  'GET /signals/:id': ['signals:read'],
  'GET /signals/trend': ['signals:read'],
  'GET /workflows': ['workflows:read'],
  'GET /workflows/:id': ['workflows:read'],
  'GET /workflows/:id/versions': ['workflows:read'],
  'GET /workflows/:id/versions/:versionId': ['workflows:read'],
  'GET /workflows/:workflowId/chat-preview/:conversationId/messages': [
    'executions:read',
  ],
  'GET /workflows/:workflowId/chat-preview/conversations': ['executions:read'],
  'GET /workflows/:workflowId/conversations/:conversationId/analysis': [
    'executions:read',
  ],
  'GET /workflows/:workflowId/executions': ['executions:read'],
  'GET /workflows/:workflowId/regression-cases': ['regressions:read'],
  'GET /workflows/:workflowId/regression-runs': ['regressions:read'],
  'GET /workflows/:workflowId/regression-runs/:id': ['regressions:read'],
  'GET /workspace/executions/:id': ['executions:read'],
  'PATCH /workflows/:id': ['workflows:write'],
  'POST /signals/:id/resolve': ['signals:write'],
  'POST /triggers/:environmentId/:slug': ['executions:start'],
  'POST /workflows': ['workflows:write'],
  'POST /workflows/:id/versions': ['workflows:write'],
  'POST /workflows/:id/versions/:versionId/publish': ['workflows:publish'],
  'POST /workflows/:workflowId/executions': ['executions:start'],
  'POST /workflows/:workflowId/regression-cases/:id/archive': [
    'regressions:write',
  ],
  'POST /workflows/:workflowId/regression-cases/from-flag': [
    'regressions:write',
  ],
  'POST /workflows/:workflowId/regression-cases/from-step': [
    'regressions:write',
  ],
  'POST /workflows/:workflowId/regression-runs': ['regressions:write'],
  'PUT /workflows/:id/draft': ['workflows:write'],
}

type Route = { route: string; scopes?: string[] }

function joinPath(...parts: (string | undefined)[]): string {
  return `/${parts
    .flatMap((part) => (part ? part.split('/') : []))
    .filter(Boolean)
    .join('/')}`
}

function workspaceAuthRoutes(): Route[] {
  const reflector = new Reflector()
  return controllers.flatMap((controller) => {
    const guards =
      reflector.get<unknown[] | undefined>(GUARDS_METADATA, controller) ?? []
    if (!guards.includes(WorkspaceAuthGuard))
      throw new Error(`${controller.name} does not run WorkspaceAuthGuard`)
    const controllerPath = reflector.get<string | undefined>(
      PATH_METADATA,
      controller,
    )
    const classScopes = reflector.get<string[] | undefined>(
      WORKSPACE_KEY_SCOPES_KEY,
      controller,
    )
    const prototype: unknown = controller.prototype
    if (typeof prototype !== 'object' || prototype === null)
      throw new Error(`${controller.name} has no prototype`)
    return Object.getOwnPropertyNames(prototype).flatMap((handler) => {
      const method: unknown = Reflect.get(prototype, handler)
      if (handler === 'constructor' || typeof method !== 'function') return []
      const requestMethod = reflector.get<RequestMethod | undefined>(
        METHOD_METADATA,
        method,
      )
      if (requestMethod === undefined) return []
      const handlerPath = reflector.get<string | undefined>(
        PATH_METADATA,
        method,
      )
      return [
        {
          route: `${RequestMethod[requestMethod]} ${joinPath(controllerPath, handlerPath)}`,
          scopes:
            reflector.get<string[] | undefined>(
              WORKSPACE_KEY_SCOPES_KEY,
              method,
            ) ?? classScopes,
        },
      ]
    })
  })
}

describe('workspace API key route scopes', () => {
  const routes = workspaceAuthRoutes()

  it('opens exactly the documented routes to workspace API keys, each with its scopes', () => {
    const keyRoutes = Object.fromEntries(
      routes.flatMap(({ route, scopes }) => (scopes ? [[route, scopes]] : [])),
    )
    expect(keyRoutes).toEqual(expectedKeyRoutes)
  })

  it('keeps arbitrary-graph runs, step replay and per-user routes session-only', () => {
    const sessionOnly = routes
      .filter(({ scopes }) => !scopes)
      .map(({ route }) => route)
    expect(sessionOnly).toEqual(
      expect.arrayContaining([
        'POST /workflows/:workflowId/test-run',
        'POST /workflows/:workflowId/chat-preview',
        'POST /executions/:id/steps/:stepId/replay',
        'POST /workflows/:id/realtime-token',
        'GET /approvals',
        'GET /notifications',
        'POST /environments/:environmentId/keys',
      ]),
    )
  })

  it('publishes the same scopes in the operation registry as the server enforces', () => {
    const workspaceKeyOperations = operationRegistry.filter(
      (operation) => operation.auth.kind === 'workspace_key',
    )
    expect(workspaceKeyOperations.length).toBeGreaterThan(0)
    for (const operation of workspaceKeyOperations) {
      const route = `${operation.method} ${operation.path.replace(/^\/v1/, '').replace(/\{(\w+)\}/g, ':$1')}`
      expect({ route, scopes: expectedKeyRoutes[route] }).toEqual({
        route,
        scopes: [...operation.auth.scopes],
      })
    }
  })
})
