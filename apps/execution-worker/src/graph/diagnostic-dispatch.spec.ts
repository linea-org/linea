import "dotenv/config"
import { pool } from "@linea/db"
import type { NodeType } from "@linea/runtime"
import type { CheckpointsService } from "../checkpoints/checkpoints.service"
import { diagnosticDispatch } from "./diagnostic-dispatch"
import { InterpreterService } from "./interpreter.service"
import type { AgentNode } from "./nodes/agent.node"
import type { AiNode } from "./nodes/ai.node"
import type { ApprovalNode } from "./nodes/approval.node"
import type { ConnectorNode } from "./nodes/connector.node"
import { NonRetryableError } from "./nodes/non-retryable-error"

afterAll(async () => {
  await pool.end()
})

function spyHandler() {
  return { execute: jest.fn(() => Promise.resolve({ ok: true })) }
}

const spies = {
  http: spyHandler(),
  transform: spyHandler(),
  branch: spyHandler(),
  ai: spyHandler(),
  approval: spyHandler(),
  memory: spyHandler(),
  wait: spyHandler(),
  datetime: spyHandler(),
  filter: spyHandler(),
  merge: spyHandler(),
  variables: spyHandler(),
  connector: spyHandler(),
  agent: spyHandler(),
}

const interpreter = new InterpreterService(
  {} as CheckpointsService,
  spies.http,
  spies.transform,
  spies.branch,
  spies.ai as unknown as AiNode,
  spies.approval as unknown as ApprovalNode,
  spies.memory,
  spies.wait,
  spies.datetime,
  spies.filter,
  spies.merge,
  spies.variables,
  spies.connector as unknown as ConnectorNode,
  spies.agent as unknown as AgentNode
)

const spiedTypes = Object.keys(spies).filter(
  (type): type is keyof typeof spies & NodeType => type in diagnosticDispatch
)

describe("InterpreterService.executeDiagnosticNode", () => {
  beforeEach(() => {
    for (const spy of Object.values(spies)) spy.execute.mockClear()
  })

  it.each(spiedTypes.filter((type) => diagnosticDispatch[type] === "refused"))(
    "never reaches the %s handler",
    async (type) => {
      await expect(
        interpreter.executeDiagnosticNode(
          { id: "n1", type, config: {} },
          {},
          { workspaceId: "ws-1", executionId: "exec-1", leasedBy: "worker-1" }
        )
      ).rejects.toThrow(NonRetryableError)
      expect(spies[type].execute).not.toHaveBeenCalled()
    }
  )

  it.each(spiedTypes.filter((type) => diagnosticDispatch[type] !== "refused"))(
    "marks the %s handler's context as diagnostic",
    async (type) => {
      await interpreter.executeDiagnosticNode(
        { id: "n1", type, config: {} },
        {},
        { workspaceId: "ws-1" }
      )
      expect(spies[type].execute).toHaveBeenCalledWith(
        {},
        {},
        expect.objectContaining({ nodeId: "n1", diagnostic: true })
      )
    }
  )

  it("refuses every node type whose handler cannot honour the diagnostic flag", () => {
    expect(
      Object.entries(diagnosticDispatch)
        .filter(([, dispatch]) => dispatch === "refused")
        .map(([type]) => type)
        .sort()
    ).toEqual(["agent", "approval", "connector", "wait"])
  })
})
