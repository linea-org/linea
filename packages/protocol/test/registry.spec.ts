import { z } from "zod"
import { describe, expect, it } from "vitest"
import type { OperationDefinition } from "../src/operations"
import { createOperationRegistry } from "../src/operations"

const request = {
  path: z.strictObject({}),
  query: z.strictObject({}),
  headers: z.strictObject({}),
  body: z.undefined(),
}

const response = { status: 200, body: z.strictObject({ ok: z.literal(true) }) }

function operation(
  operationId: string,
  method: OperationDefinition["method"],
  path: OperationDefinition["path"]
): OperationDefinition {
  return {
    operationId,
    method,
    path,
    plane: "control",
    auth: { kind: "application_key", scopes: ["executions:read"] },
    request,
    response,
    errors: ["rate_limited"],
  }
}

describe("operation registry", () => {
  it("retains complete versioned operation definitions", () => {
    const registered = createOperationRegistry([
      operation("getExecution", "GET", "/v1/executions/{executionId}"),
    ])
    expect(registered[0]).toMatchObject({
      operationId: "getExecution",
      method: "GET",
      path: "/v1/executions/{executionId}",
      plane: "control",
      auth: { kind: "application_key" },
      errors: ["rate_limited"],
    })
    expect(registered[0]?.request).toBe(request)
    expect(registered[0]?.response).toBe(response)
  })

  it("rejects duplicate operation IDs", () => {
    expect(() =>
      createOperationRegistry([
        operation("getExecution", "GET", "/v1/executions/{executionId}"),
        operation("getExecution", "GET", "/v1/executions/{id}"),
      ])
    ).toThrow("Duplicate operation ID: getExecution")
  })

  it("rejects duplicate method and path pairs", () => {
    expect(() =>
      createOperationRegistry([
        operation("getExecution", "GET", "/v1/executions/{executionId}"),
        operation("readExecution", "GET", "/v1/executions/{executionId}"),
      ])
    ).toThrow("Duplicate operation route: GET /v1/executions/{executionId}")
  })
})
