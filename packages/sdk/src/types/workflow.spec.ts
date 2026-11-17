import type { workflowGraphSchema } from "@linea/runtime"
import { expectTypeOf, it } from "vitest"
import type { WorkflowGraph } from "./workflow.js"

type RuntimeGraphInput = (typeof workflowGraphSchema)["_zod"]["input"]

it("keeps WorkflowGraph in step with the runtime graph schema", () => {
  expectTypeOf<WorkflowGraph>().toEqualTypeOf<RuntimeGraphInput>()
})
