import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { z } from "zod"

// CopilotKit reaches zod through its own schema converter, which the zod override changed.
const require = createRequire(
  import.meta.resolve("@copilotkit/react-core/package.json")
)

describe("CopilotKit schema conversion", () => {
  it("turns the approval tool parameters into the JSON schema the model sees", async () => {
    const shared: unknown = await import(require.resolve("@copilotkit/shared"))
    if (
      typeof shared !== "object" ||
      shared === null ||
      !("schemaToJsonSchema" in shared) ||
      typeof shared.schemaToJsonSchema !== "function"
    ) {
      throw new TypeError("CopilotKit no longer exports schemaToJsonSchema")
    }
    const schema: unknown = Reflect.apply(shared.schemaToJsonSchema, shared, [
      z.object({ approvalRequestId: z.string() }),
    ])
    expect(schema).toMatchObject({
      type: "object",
      properties: { approvalRequestId: { type: "string" } },
      required: ["approvalRequestId"],
    })
  })
})
