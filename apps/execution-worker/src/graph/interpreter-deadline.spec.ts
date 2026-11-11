import {
  CheckpointsService,
  LeaseLostError,
} from "../checkpoints/checkpoints.service"
import { HttpNode } from "./nodes/http.node"
import { TransformNode } from "./nodes/transform.node"
import { BranchNode } from "./nodes/branch.node"
import { AiNode } from "./nodes/ai.node"
import { ApprovalNode } from "./nodes/approval.node"
import { MemoryNode } from "./nodes/memory.node"
import { WaitNode } from "./nodes/wait.node"
import { DatetimeNode } from "./nodes/datetime.node"
import { FilterNode } from "./nodes/filter.node"
import { MergeNode } from "./nodes/merge.node"
import { VariablesNode } from "./nodes/variables.node"
import { InterpreterService, type RunInput } from "./interpreter.service"
import { pool } from "@linea/db"

const input: RunInput = {
  executionId: "execution",
  workspaceId: "workspace",
  leasedBy: "worker",
  triggerPayload: {},
  resumeFrom: new Map(),
  graph: {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "http",
    nodes: [{ id: "http", type: "http", config: {} }],
    edges: [],
  },
}

function setup() {
  const checkpoints = new CheckpointsService()
  jest.spyOn(checkpoints, "assertOwnsLease").mockResolvedValue(undefined)
  jest.spyOn(checkpoints, "recordStep").mockResolvedValue(undefined)
  const http = new HttpNode()
  const interpreter = new InterpreterService(
    checkpoints,
    http,
    new TransformNode(),
    new BranchNode(),
    new AiNode(),
    new ApprovalNode(),
    new MemoryNode(),
    new WaitNode(),
    new DatetimeNode(),
    new FilterNode(),
    new MergeNode(),
    new VariablesNode()
  )
  return { interpreter, http }
}

afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  await pool.end()
})

describe("Interpreter deadlines", () => {
  it("aborts a node with no author timeout and records a failure", async () => {
    const deadline = new AbortController()
    const attempt = new AbortController()
    const timeout = jest
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms) =>
        ms === 60_000 ? attempt.signal : deadline.signal
      )
    const { interpreter, http } = setup()
    jest.spyOn(http, "execute").mockImplementation(
      (_config, _input, context) =>
        new Promise((_resolve, reject) => {
          context.signal?.addEventListener(
            "abort",
            () => reject(new Error("Attempt timed out")),
            { once: true }
          )
        })
    )
    const pending = interpreter.run(input)
    await new Promise(setImmediate)
    expect(timeout).toHaveBeenCalledWith(60_000)
    attempt.abort(new DOMException("Attempt timed out", "TimeoutError"))
    expect((await pending).result?.status).toBe("failed")
  })
  it("interrupts retry sleep when the run deadline expires", async () => {
    const deadline = new AbortController()
    jest.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
    const { interpreter, http } = setup()
    const execute = jest
      .spyOn(http, "execute")
      .mockRejectedValue(new Error("retry me"))
    const pending = interpreter.run({
      ...input,
      graph: {
        ...input.graph,
        nodes: [
          {
            id: "http",
            type: "http",
            config: {
              retryPolicy: {
                maxAttempts: 5,
                backoff: { type: "fixed", delayMs: 60_000 },
              },
            },
          },
        ],
      },
    })
    await new Promise(setImmediate)
    deadline.abort(new DOMException("Run timed out", "TimeoutError"))
    expect((await pending).result?.status).toBe("failed")
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it("still treats a revoked lease as lease loss", async () => {
    const lease = new AbortController()
    lease.abort()
    const { interpreter } = setup()
    await expect(
      interpreter.run({ ...input, signal: lease.signal })
    ).rejects.toBeInstanceOf(LeaseLostError)
  })
})
