import { z } from "zod"
import { describe, expect, it } from "vitest"
import type { OperationDefinition } from "../src/operations"
import { createOperationRegistry } from "../src/operations"
import { operationRegistry } from "../src/registry"

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
  it("publishes the end-user authorization protocol", () => {
    expect(operationRegistry.map(({ operationId }) => operationId)).toEqual([
      "startEndUserAuthorization",
      "exchangeEndUserAuthorization",
      "createEndUserSession",
      "revokeEndUserSession",
      "createApplicationConversation",
      "listApplicationConversations",
      "getApplicationConversation",
      "startApplicationExecution",
      "getApplicationExecution",
      "cancelApplicationExecution",
      "createEndUserConversation",
      "listEndUserConversations",
      "getEndUserConversation",
      "createEndUserMessage",
      "listEndUserMessages",
      "startEndUserExecution",
      "getEndUserExecution",
    ])
  })

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

  it("publishes paginated list contracts", () => {
    const listMessages = operationRegistry.find(
      ({ operationId }) => operationId === "listEndUserMessages"
    )
    if (!listMessages) throw new Error("Message list operation is missing")
    expect(listMessages.request.query.parse({})).toEqual({ limit: 20 })
    expect(
      listMessages.response.body.safeParse({ data: [], nextCursor: null })
        .success
    ).toBe(true)
  })

  it("rejects duplicate operation IDs", () => {
    expect(() =>
      createOperationRegistry([
        operation("getExecution", "GET", "/v1/executions/{executionId}"),
        operation("getExecution", "GET", "/v1/executions/{id}"),
      ])
    ).toThrow("Duplicate operation ID: getExecution")
  })

  it("rejects equivalent routes with different placeholder names", () => {
    expect(() =>
      createOperationRegistry([
        operation("getExecution", "GET", "/v1/executions/{executionId}"),
        operation("readExecution", "GET", "/v1/executions/{id}"),
      ])
    ).toThrow("Duplicate operation route: GET /v1/executions/{}")
  })

  it("freezes registered operation metadata", () => {
    const source = operation(
      "getExecution",
      "GET",
      "/v1/executions/{executionId}"
    )
    createOperationRegistry([source])
    expect(Object.isFrozen(source)).toBe(true)
    expect(Object.isFrozen(source.auth)).toBe(true)
    expect(Object.isFrozen(source.auth.scopes)).toBe(true)
    expect(Object.isFrozen(source.request)).toBe(true)
    expect(Object.isFrozen(source.response)).toBe(true)
    expect(Object.isFrozen(source.errors)).toBe(true)
    expect(Reflect.set(source, "path", "/v1/changed")).toBe(false)
    expect(Reflect.set(source.auth, "kind", "none")).toBe(false)
    expect(Reflect.set(source.response, "status", 201)).toBe(false)
  })
})
