import { seedExecution } from "@linea/db/testing"
import "dotenv/config"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { AiNode } from "../graph/nodes/ai.node"
import { ApprovalNode } from "../graph/nodes/approval.node"
import { MemoryNode } from "../graph/nodes/memory.node"
import { WaitNode } from "../graph/nodes/wait.node"
import { BranchNode } from "../graph/nodes/branch.node"
import { DatetimeNode } from "../graph/nodes/datetime.node"
import { FilterNode } from "../graph/nodes/filter.node"
import { HttpNode } from "../graph/nodes/http.node"
import { MergeNode } from "../graph/nodes/merge.node"
import { VariablesNode } from "../graph/nodes/variables.node"
import { TransformNode } from "../graph/nodes/transform.node"
import { RunLeaseService } from "./run-lease.service"
import { AgentExecutionService } from "./agent-execution.service"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"
import { RunsService } from "./runs.service"

const graph: WorkflowGraph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "approval-1",
  nodes: [
    { id: "approval-1", type: "approval", config: {} },
    {
      id: "http-1",
      type: "http",
      config: { url: "https://example.com/hook", method: "POST" },
    },
  ],
  edges: [{ from: "approval-1", to: "http-1" }],
}

function buildRuns(httpNode: HttpNode) {
  const checkpoints = new CheckpointsService()
  const interpreter = new InterpreterService(
    checkpoints,
    httpNode,
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
  return new RunsService(
    checkpoints,
    interpreter,
    new RunLeaseService(),
    new AgentExecutionService(checkpoints, new ConnectorGatewayService())
  )
}

async function createOrganization() {
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Claim Authority Test Org",
      slug: `claim-authority-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning()
  return organization
}

afterAll(async () => {
  await pool.end()
})

describe("RunsService claim authority", () => {
  it("does not run an Execution queued before its Environment was disabled", async () => {
    const organization = await createOrganization()
    try {
      const { execution } = await seedExecution(db, organization.id, graph)
      if (!execution.environmentId)
        throw new Error("Execution has no Environment")
      await pool.query(
        "UPDATE environments SET enabled = false WHERE id = $1",
        [execution.environmentId]
      )
      const httpNode = new HttpNode()
      const http = jest.spyOn(httpNode, "execute")
      await buildRuns(httpNode).execute(execution.id)
      expect(http).not.toHaveBeenCalled()
      expect(
        await repositories.approvalRequest.getPendingApprovalRequestForExecution(
          db,
          execution.id
        )
      ).toBeUndefined()
      expect(
        await repositories.execution.getExecutionById(db, execution.id)
      ).toMatchObject({
        status: "failed",
        error: { code: "authority_revoked" },
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
  it("does not continue a paused Execution approved after its External Subject was disabled", async () => {
    const organization = await createOrganization()
    const [approver] = await db
      .insert(schema.users)
      .values({ name: "Approver", email: `approver-${randomUUID()}@test.dev` })
      .returning()
    try {
      await db.insert(schema.members).values({
        organizationId: organization.id,
        userId: approver.id,
        role: "member",
        createdAt: new Date(),
      })
      const { execution } = await seedExecution(db, organization.id, graph)
      const [subject] = await db
        .insert(schema.externalSubjects)
        .values({
          workspaceId: organization.id,
          issuer: "https://identity.example.com",
          issuerSubject: `subject-${randomUUID()}`,
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      await pool.query(
        "UPDATE executions SET external_subject_record_id = $1 WHERE id = $2",
        [subject.id, execution.id]
      )
      const httpNode = new HttpNode()
      const http = jest.spyOn(httpNode, "execute")
      const runs = buildRuns(httpNode)
      await runs.execute(execution.id)
      expect(
        (await repositories.execution.getExecutionById(db, execution.id))
          ?.status
      ).toBe("paused")
      const request =
        await repositories.approvalRequest.getPendingApprovalRequestForExecution(
          db,
          execution.id
        )
      if (!request) throw new Error("Approval Request was not created")
      await pool.query(
        "UPDATE external_subjects SET status = 'disabled', disabled_at = now() WHERE id = $1",
        [subject.id]
      )
      await repositories.approvalRequest.decideWorkspaceApprovalRequest(
        db,
        organization.id,
        request.id,
        {
          outcome: "approved",
          actorUserId: approver.id,
          actorEmail: approver.email,
        }
      )
      expect(
        (await repositories.execution.getExecutionById(db, execution.id))
          ?.status
      ).toBe("queued")
      await runs.execute(execution.id)
      expect(http).not.toHaveBeenCalled()
      expect(
        await repositories.execution.getExecutionById(db, execution.id)
      ).toMatchObject({
        status: "failed",
        error: {
          message:
            "Execution authority revoked: External Subject disabled or erased",
          code: "authority_revoked",
        },
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
})
