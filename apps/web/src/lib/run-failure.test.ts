import { describe, expect, it } from "vitest"

import { runFailureFix } from "./run-failure"

describe("runFailureFix", () => {
  it("offers to add the key when the model's key is missing", () => {
    expect(
      runFailureFix(
        "No OPENAI_API_KEY is set. Add your key under Settings, Models to run this step."
      )
    ).toEqual({ label: "Add your key", to: "models" })
  })

  it("offers to update the key when the provider rejects it", () => {
    expect(
      runFailureFix("401 Incorrect API key provided: sk-fake-****-key.")
    ).toEqual({ label: "Update your key", to: "models" })
  })

  it("points at the workflow when the node's model is unknown", () => {
    expect(runFailureFix('Unknown model: "gpt-0"')).toEqual({
      label: "Change the model",
      to: "workflow",
    })
  })

  it("offers nothing for other failures", () => {
    expect(runFailureFix("The provider timed out")).toBeNull()
  })
})
