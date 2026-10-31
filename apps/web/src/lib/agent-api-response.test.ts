import { describe, expect, it } from "vitest"
import { z } from "zod"
import { agentApiResponse } from "./agent-api-response"

describe("Agent API errors", () => {
  it("surfaces Contract validation failures returned as structured issues", async () => {
    await expect(
      agentApiResponse(
        Response.json(
          {
            message: [
              {
                code: "custom",
                path: ["inputSchema"],
                message: "unknown keyword: invalid",
              },
            ],
          },
          { status: 400 }
        ),
        z.object({ id: z.uuid() })
      )
    ).rejects.toThrow("unknown keyword: invalid")
  })
  it("explains the required management role and session", async () => {
    await expect(
      agentApiResponse(
        Response.json({ message: "Forbidden" }, { status: 403 }),
        z.object({ id: z.uuid() })
      )
    ).rejects.toThrow("signed-in workspace admin or owner")
  })
  it("rejects malformed successful responses rather than using incomplete data", async () => {
    await expect(
      agentApiResponse(Response.json({}), z.object({ id: z.uuid() }))
    ).rejects.toThrow()
  })
})
