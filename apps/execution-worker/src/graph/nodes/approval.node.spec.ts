import { getTestApplicationId } from "@linea/db/testing"
import "dotenv/config"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"

const sendEmail = jest.fn<
  Promise<void>,
  [{ to: string; subject: string; html: string; text?: string }]
>(() => Promise.resolve())
jest.mock("@linea/auth/email", () => ({ sendEmail }))

import { ApprovalNode } from "./approval.node"
import { consumeApprovalEmailQuota } from "./approval-email-quota"

afterAll(async () => {
  await pool.end()
})

async function setup() {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Approval Node Test Org",
      slug: `approval-node-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    applicationId: await getTestApplicationId(db, organization.id),
    workspaceId: organization.id,
    name: "Approval Node Test Workflow",
    slug: `approval-node-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "approval-node-hash",
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
  })
  const [approver] = await db
    .insert(schema.users)
    .values({ name: "Test Approver", email: `anyone-${suffix}@test.dev` })
    .returning()
  await db.insert(schema.members).values({
    organizationId: organization.id,
    userId: approver.id,
    role: "member",
    createdAt: new Date(),
  })
  return { organization, execution, approver }
}

describe("ApprovalNode", () => {
  it("rejects an unsupported audience before persistence", async () => {
    const node = new ApprovalNode()
    await expect(
      node.execute({ audience: "anyone" }, undefined, {
        workspaceId: randomUUID(),
        executionId: randomUUID(),
        nodeId: "approval-1",
      })
    ).rejects.toThrow('Approval node audience must be "workspace"')
  })
  it("rejects a title longer than the persistence limit", async () => {
    const node = new ApprovalNode()
    await expect(
      node.execute({ message: "x".repeat(201) }, undefined, {
        workspaceId: randomUUID(),
        executionId: randomUUID(),
        nodeId: "approval-1",
      })
    ).rejects.toThrow("Approval display title must not exceed 200 characters")
  })
  it("creates a pending approval and pauses on first visit, then pauses again while still pending", async () => {
    const { organization, execution, approver } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }
      await expect(
        node.execute({ message: "Ship it?" }, undefined, context)
      ).rejects.toThrow("Execution paused at node approval-1")
      const approval = await repositories.approvalRequest.getApprovalRequest(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      expect(approval).toMatchObject({
        status: "pending",
        display: { title: "Ship it?" },
      })
      // Second visit (a resumed run re-entering the same node) — still pending, pauses again without creating a duplicate row.
      await expect(node.execute({}, undefined, context)).rejects.toThrow(
        "Execution paused at node approval-1"
      )
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
  it("resolves to approved output once the approval is responded to", async () => {
    const { organization, execution, approver } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }
      await expect(node.execute({}, undefined, context)).rejects.toThrow()
      const approval = await repositories.approvalRequest.getApprovalRequest(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      await repositories.approvalRequest.decideWorkspaceApprovalRequest(
        db,
        organization.id,
        approval!.id,
        {
          outcome: "approved",
          actorUserId: approver.id,
          actorEmail: approver.email,
          comment: "looks good",
        }
      )
      const output = await node.execute({}, undefined, context)
      expect(output).toMatchObject({
        approved: true,
        comment: "looks good",
        timedOut: false,
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
  it("resolves to approved: false when rejected", async () => {
    const { organization, execution, approver } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }
      await expect(node.execute({}, undefined, context)).rejects.toThrow()
      const approval = await repositories.approvalRequest.getApprovalRequest(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      await repositories.approvalRequest.decideWorkspaceApprovalRequest(
        db,
        organization.id,
        approval!.id,
        {
          outcome: "rejected",
          actorUserId: approver.id,
          actorEmail: approver.email,
        }
      )
      const output = await node.execute({}, undefined, context)
      expect(output).toMatchObject({ approved: false, timedOut: false })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
  it("reflects a timed-out resolution", async () => {
    const { organization, execution, approver } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }
      await expect(
        node.execute(
          { timeoutMinutes: "1", timeoutAction: "auto_reject" },
          undefined,
          context
        )
      ).rejects.toThrow()
      await repositories.approvalRequest.claimAndDecideTimedOutApprovalRequest(
        db,
        new Date(Date.now() + 120_000),
        organization.id
      )
      const output = await node.execute({}, undefined, context)
      expect(output).toMatchObject({ approved: false, timedOut: true })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
  it.each([
    42,
    "not-an-email",
    Array.from({ length: 21 }, (_, i) => `member${i}@test.dev`).join(","),
  ])(
    "rejects hostile stored config %p before creating a request",
    async (approverEmails) => {
      const { organization, execution, approver } = await setup()
      sendEmail.mockClear()
      try {
        await expect(
          new ApprovalNode().execute({ approverEmails }, undefined, {
            workspaceId: organization.id,
            executionId: execution.id,
            nodeId: "approval-hostile",
          })
        ).rejects.toThrow()
        expect(
          await repositories.approvalRequest.getApprovalRequest(
            db,
            organization.id,
            execution.id,
            "approval-hostile"
          )
        ).toBeUndefined()
        expect(sendEmail).not.toHaveBeenCalled()
      } finally {
        await pool.query("DELETE FROM organizations WHERE id = $1", [
          organization.id,
        ])
        await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
      }
    }
  )
  it("never emails an outsider-only list or a removed member", async () => {
    const { organization, execution, approver } = await setup()
    sendEmail.mockClear()
    try {
      await pool.query("DELETE FROM members WHERE organization_id = $1", [
        organization.id,
      ])
      await expect(
        new ApprovalNode().execute(
          { approverEmails: `${approver.email},outsider@test.dev` },
          undefined,
          {
            workspaceId: organization.id,
            executionId: execution.id,
            nodeId: "approval-removed",
          }
        )
      ).rejects.toThrow("Execution paused")
      expect(sendEmail).not.toHaveBeenCalled()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
  it("keeps the Approval Request pending but sends no email when the workspace quota is exhausted", async () => {
    const { organization, execution, approver } = await setup()
    sendEmail.mockClear()
    try {
      expect(await consumeApprovalEmailQuota(organization.id, 100)).toBe(true)
      await expect(
        new ApprovalNode().execute(
          { approverEmails: approver.email },
          undefined,
          {
            workspaceId: organization.id,
            executionId: execution.id,
            nodeId: "approval-quota",
          }
        )
      ).rejects.toThrow("Execution paused")
      expect(sendEmail).not.toHaveBeenCalled()
      expect(
        await repositories.approvalRequest.getApprovalRequest(
          db,
          organization.id,
          execution.id,
          "approval-quota"
        )
      ).toMatchObject({ status: "pending" })
      const notifications = await pool.query(
        "SELECT user_id FROM notifications WHERE workspace_id = $1",
        [organization.id]
      )
      expect(notifications.rows).toEqual([{ user_id: approver.id }])
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
  it("escapes the approval message before sending it as email HTML", async () => {
    const { organization, execution, approver } = await setup()
    sendEmail.mockClear()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }
      await expect(
        node.execute(
          {
            message: '<img src=x onerror="alert(1)"> ship it & <b>hurry</b>',
            approverEmails: `outsider@test.dev, ${approver.email.toUpperCase()}, ${approver.email}`,
          },
          undefined,
          context
        )
      ).rejects.toThrow("Execution paused at node approval-1")
      expect(sendEmail).toHaveBeenCalledTimes(1)
      const [call] = sendEmail.mock.calls
      expect(call[0].to).toBe(approver.email)
      const html = call[0].html
      expect(html).toContain(
        "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; ship it &amp; &lt;b&gt;hurry&lt;/b&gt;"
      )
      expect(html).not.toContain("<img")
      expect(html).not.toContain("<b>")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
    }
  })
})
