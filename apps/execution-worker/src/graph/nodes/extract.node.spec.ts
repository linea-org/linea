import type { CompletionRequest, CompletionResult } from "@linea/ai"

const complete = jest.fn<
  Promise<CompletionResult>,
  [string, CompletionRequest]
>()
const resolveProvider = jest.fn(() => ({ complete }))
const resolveKeyName = jest.fn(() => "anthropic")
const resolveApiKey = jest.fn(() => Promise.resolve({ apiKey: "secret" }))

jest.mock("@linea/ai", () => ({
  resolveProvider,
  resolveKeyName,
  resolveApiKey,
}))

jest.mock("@linea/db", () => ({ db: {} }))

import { ExtractNode } from "./extract.node"
import { NonRetryableError } from "./non-retryable-error"

const config = {
  model: "claude-sonnet-5",
  instructions: "Extract the product name and quantity.",
  sourcePath: "body",
  schema: {
    type: "object",
    properties: {
      product: { type: "string" },
      quantity: { type: "number" },
    },
    required: ["product", "quantity"],
  },
}

describe("ExtractNode", () => {
  beforeEach(() => {
    complete.mockClear()
    resolveProvider.mockClear()
    resolveKeyName.mockClear()
    resolveApiKey.mockClear()
  })

  it("extracts data through the provider tool interface and validates the result", async () => {
    complete.mockResolvedValue({
      text: "",
      tokensInput: 12,
      tokensOutput: 4,
      toolCalls: [
        {
          id: "call-1",
          name: "report_extraction",
          arguments: { product: "notebook", quantity: 2 },
        },
      ],
    })

    const result = await new ExtractNode().execute(
      config,
      { body: "Please send two notebooks." },
      { workspaceId: "ws-1" }
    )

    expect(result).toEqual({
      data: { product: "notebook", quantity: 2 },
      tokensInput: 12,
      tokensOutput: 4,
    })
    const [, request] = complete.mock.calls[0]
    expect(request.prompt).toContain("Please send two notebooks.")
    expect(complete).toHaveBeenCalledWith(
      "secret",
      expect.objectContaining({
        model: "claude-sonnet-5",
        tools: [
          expect.objectContaining({
            name: "report_extraction",
            parameters: config.schema,
          }),
        ],
      })
    )
  })

  it("rejects an invalid configured schema before calling the provider", async () => {
    await expect(
      new ExtractNode().execute(
        { ...config, schema: { type: "array" } },
        { body: "irrelevant" },
        { workspaceId: "ws-1" }
      )
    ).rejects.toBeInstanceOf(NonRetryableError)

    expect(complete).not.toHaveBeenCalled()
  })

  it("marks a non-text source as non-retryable", async () => {
    await expect(
      new ExtractNode().execute(config, { body: 1 }, { workspaceId: "ws-1" })
    ).rejects.toBeInstanceOf(NonRetryableError)

    expect(complete).not.toHaveBeenCalled()
  })

  it("preserves paid usage when the model returns data outside the schema", async () => {
    complete.mockResolvedValue({
      text: "",
      tokensInput: 12,
      tokensOutput: 4,
      toolCalls: [
        {
          id: "call-1",
          name: "report_extraction",
          arguments: { product: "notebook", quantity: "two" },
        },
      ],
    })

    await expect(
      new ExtractNode().execute(
        config,
        { body: "Please send two notebooks." },
        { workspaceId: "ws-1" }
      )
    ).rejects.toMatchObject({ tokensInput: 12, tokensOutput: 4 })
  })
})
