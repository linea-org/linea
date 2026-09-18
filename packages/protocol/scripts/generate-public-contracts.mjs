import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { format, resolveConfig } from "prettier"
import ts from "typescript"
import { z } from "zod"
import { publicErrorStatuses } from "../dist/errors.js"
import { operationRegistry } from "../dist/operations.js"

const repository = resolve(import.meta.dirname, "../../..")
const openapiPath = resolve(repository, "docs/openapi.json")
const routesPath = resolve(repository, "docs/route-reference.md")
const checking = process.argv.includes("--check")

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, ordered(entry)])
  )
}

function jsonSchema(schema, io = "output") {
  const result = z.toJSONSchema(schema, { unrepresentable: "any", io })
  delete result.$schema
  return ordered(result)
}

function rewriteDefinitionReferences(value, names) {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteDefinitionReferences(entry, names))
  }
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key !== "$ref" || typeof entry !== "string") {
        return [key, rewriteDefinitionReferences(entry, names)]
      }
      const localName = entry.match(/^#\/\$defs\/(.+)$/)?.[1]
      return [key, localName && names[localName] ? names[localName] : entry]
    })
  )
}

function openapiSchema(schema, definitions, prefix, io) {
  const document = jsonSchema(schema, io)
  const localDefinitions = document.$defs ?? {}
  delete document.$defs
  const names = Object.fromEntries(
    Object.keys(localDefinitions).map((name) => [
      name,
      `#/components/schemas/${prefix}_${name}`,
    ])
  )
  for (const [name, definition] of Object.entries(localDefinitions)) {
    definitions[`${prefix}_${name}`] = rewriteDefinitionReferences(
      definition,
      names
    )
  }
  return rewriteDefinitionReferences(document, names)
}

function acceptsUndefined(schema) {
  return schema.safeParse(undefined).success
}

function parameters(schema, location, definitions, prefix) {
  const document = openapiSchema(schema, definitions, prefix, "input")
  const required = new Set(document.required ?? [])
  return Object.entries(document.properties ?? {})
    .filter(([name]) => name !== "authorization")
    .map(([name, property]) => ({
      name,
      in: location,
      required: location === "path" || required.has(name),
      schema: property,
    }))
}

function security(operation) {
  if (operation.auth.kind === "none") return []
  const scheme = {
    workspace_session: "workspaceSession",
    workspace_key: "workspaceKey",
    application_key: "applicationKey",
    end_user_session: "endUserSession",
  }[operation.auth.kind]
  return [{ [scheme]: operation.auth.scopes }]
}

function errorResponse(operation, status) {
  const codes = operation.errors.filter(
    (code) => publicErrorStatuses[code] === status
  )
  return {
    description: `Stable errors: ${codes.join(", ")}`,
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["error"],
          properties: {
            error: {
              type: "object",
              additionalProperties: false,
              required: ["code", "message"],
              properties: {
                code: { type: "string", enum: codes },
                message: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
  }
}

function openapiOperation(operation, definitions) {
  const response = { description: "Success" }
  if (!acceptsUndefined(operation.response.body)) {
    response.content = {
      [operation.response.contentType ?? "application/json"]: {
        schema: openapiSchema(
          operation.response.body,
          definitions,
          `${operation.operationId}_response`,
          "output"
        ),
      },
    }
  }
  const responses = { [operation.response.status]: response }
  for (const status of [
    ...new Set(operation.errors.map((code) => publicErrorStatuses[code])),
  ].sort((left, right) => left - right)) {
    responses[status] = errorResponse(operation, status)
  }
  const result = {
    operationId: operation.operationId,
    summary: operation.purpose,
    description: operation.caller,
    tags: [operation.plane],
    security: security(operation),
    parameters: [
      ...parameters(
        operation.request.path,
        "path",
        definitions,
        `${operation.operationId}_path`
      ),
      ...parameters(
        operation.request.query,
        "query",
        definitions,
        `${operation.operationId}_query`
      ),
      ...parameters(
        operation.request.headers,
        "header",
        definitions,
        `${operation.operationId}_headers`
      ),
    ],
    responses,
    "x-linea-idempotency": operation.idempotency,
    "x-linea-rate-limit": operation.rateLimit,
    "x-linea-sdk": operation.sdk,
  }
  if (!acceptsUndefined(operation.request.body)) {
    result.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: openapiSchema(
            operation.request.body,
            definitions,
            `${operation.operationId}_body`,
            "input"
          ),
        },
      },
    }
  }
  return result
}

function generateOpenapi() {
  const paths = {}
  const schemas = {}
  for (const operation of operationRegistry) {
    paths[operation.path] ??= {}
    paths[operation.path][operation.method.toLowerCase()] = openapiOperation(
      operation,
      schemas
    )
  }
  return `${JSON.stringify(
    ordered({
      openapi: "3.1.0",
      info: {
        title: "Linea Public API",
        version: "1.0.0",
        description:
          "Generated from @linea/protocol's public operation registry.",
      },
      servers: [{ url: "https://api.linea.dev" }],
      tags: [
        { name: "control", description: "Trusted Operator control plane" },
        { name: "end_user", description: "Proof-bound End-User plane" },
      ],
      paths,
      components: {
        schemas,
        securitySchemes: {
          applicationKey: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "Application key",
          },
          endUserSession: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "DPoP-bound session",
          },
          workspaceKey: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "Workspace key",
          },
          workspaceSession: {
            type: "apiKey",
            in: "cookie",
            name: "linea.session",
          },
        },
      },
    }),
    null,
    2
  )}\n`
}

function authentication(operation) {
  const scopes = operation.auth.scopes.length
    ? `; scopes: ${operation.auth.scopes.join(", ")}`
    : ""
  return `${operation.auth.kind}${scopes}`
}

function sdkMethod(operation) {
  if ("reason" in operation.sdk) return `No SDK method: ${operation.sdk.reason}`
  return `\`${operation.sdk.client}.${operation.sdk.method}\` from \`${operation.sdk.importPath}\``
}

function schemaBlock(schema, io) {
  if (acceptsUndefined(schema)) return "None."
  return `\`\`\`json\n${JSON.stringify(jsonSchema(schema, io), null, 2)}\n\`\`\``
}

function retryability(code) {
  return code === "rate_limited" || code === "service_unavailable"
    ? "retryable"
    : "not automatically retryable"
}

function environmentName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase()
}

function requiredNames(schema) {
  const document = jsonSchema(schema, "input")
  return (document.required ?? []).filter((name) => name !== "authorization")
}

function curlExample(operation) {
  if (operation.plane !== "control")
    return "Not shown for browser/native credentials."
  const credential =
    operation.auth.kind === "application_key"
      ? "$LINEA_APPLICATION_KEY"
      : "$LINEA_WORKSPACE_KEY"
  const path = operation.path.replace(
    /\{([^}]+)\}/g,
    (_, name) => `$${environmentName(name)}`
  )
  const query = requiredNames(operation.request.query)
    .map((name) => `${name}=$${environmentName(name)}`)
    .join("&")
  const url = `https://api.linea.dev${path}${query ? `?${query}` : ""}`
  const lines = [
    `curl --request ${operation.method} \"${url}\"`,
    `--header \"Authorization: Bearer ${credential}\"`,
    ...requiredNames(operation.request.headers).map(
      (name) => `--header \"${name}: $${environmentName(name)}\"`
    ),
  ]
  if (!acceptsUndefined(operation.request.body)) {
    lines.push(
      "--header 'Content-Type: application/json'",
      '--data "$REQUEST_JSON"'
    )
  }
  return `\`\`\`sh\n${lines.join(" \\\n  ")}\n\`\`\``
}

function routeEntry(operation) {
  const errors = operation.errors
    .map(
      (code) =>
        `| \`${code}\` | ${publicErrorStatuses[code]} | ${retryability(code)} |`
    )
    .join("\n")
  const typescript =
    "reason" in operation.sdk
      ? `No example: ${operation.sdk.reason}`
      : `\`\`\`ts\nimport { ${operation.sdk.client} } from "${operation.sdk.importPath}"\n\nawait client.${operation.sdk.method}(/* typed arguments */)\n\`\`\``
  return `<!-- operation:${operation.operationId} -->
## ${operation.operationId}

${operation.purpose}

- Caller plane: \`${operation.plane}\`
- Intended caller: ${operation.caller}
- Authentication: ${authentication(operation)}
- Method and path: \`${operation.method} ${operation.path}\`
- Idempotency: ${operation.idempotency}
- Rate limits: ${operation.rateLimit}
- Pagination or event resumption: ${operation.pagination}
- Emitted events/webhooks: ${operation.events}
- SDK method: ${sdkMethod(operation)}

### Request

Path parameters:

${schemaBlock(operation.request.path, "input")}

Query parameters:

${schemaBlock(operation.request.query, "input")}

Header parameters:

${schemaBlock(operation.request.headers, "input")}

Body:

${schemaBlock(operation.request.body, "input")}

### Response

Status: \`${operation.response.status}\`

${schemaBlock(operation.response.body, "output")}

### Stable errors

| Code | Status | Retryability |
| --- | ---: | --- |
${errors}

### TypeScript

${typescript}

### cURL

${curlExample(operation)}
`
}

function generateRoutes() {
  const entries = operationRegistry.map(routeEntry).join("\n")
  return `# Public route reference

Generated from \`@linea/protocol\`. Do not edit this file directly.

${entries}`
}

function hasMethodDeclaration(source, filename, methodName) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let found = false
  function visit(node) {
    if (
      ts.isMethodDeclaration(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === methodName
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function assertAdapter(operation) {
  const source = readFileSync(
    resolve(repository, operation.adapter.source),
    "utf8"
  )
  if (
    !hasMethodDeclaration(
      source,
      operation.adapter.source,
      operation.adapter.handler
    )
  ) {
    throw new Error(
      `${operation.operationId} lacks its registered platform-api adapter`
    )
  }
}

function assertDocumentation(operation, documented, routes) {
  if (!documented.has(operation.operationId)) {
    throw new Error(`${operation.operationId} lacks an OpenAPI entry`)
  }
  if (!routes.includes(`<!-- operation:${operation.operationId} -->`)) {
    throw new Error(`${operation.operationId} lacks a route-reference entry`)
  }
}

const sdkSources = {
  LineaApplicationClient: "packages/sdk/src/server/application-client.ts",
  LineaUserClient: "packages/sdk/src/user/user-client.ts",
  LineaWorkspaceClient: "packages/sdk/src/server/workspace-client.ts",
}

function assertSdk(operation) {
  if ("reason" in operation.sdk) {
    if (!operation.sdk.reason.trim()) {
      throw new Error(`${operation.operationId} has an empty no-SDK reason`)
    }
    return
  }
  const source = readFileSync(
    resolve(repository, sdkSources[operation.sdk.client]),
    "utf8"
  )
  if (
    !hasMethodDeclaration(
      source,
      sdkSources[operation.sdk.client],
      operation.sdk.method
    )
  ) {
    throw new Error(`${operation.operationId} lacks its registered SDK method`)
  }
}

function assertCoverage(openapi, routes) {
  const openapiDocument = JSON.parse(openapi)
  const documented = new Set(
    Object.values(openapiDocument.paths).flatMap((path) =>
      Object.values(path).map((operation) => operation.operationId)
    )
  )
  for (const operation of operationRegistry) {
    assertAdapter(operation)
    assertDocumentation(operation, documented, routes)
    assertSdk(operation)
  }
  assertReferences(openapiDocument)
  for (const forbidden of [
    "workspaceId",
    "sessionId",
    "secretHash",
    "tokenHash",
    "/v1/internal",
  ]) {
    if (openapi.includes(forbidden) || routes.includes(forbidden)) {
      throw new Error(
        `Generated public contracts expose forbidden internal data: ${forbidden}`
      )
    }
  }
}

function assertReferences(document) {
  function resolveReference(reference) {
    return reference
      .slice(2)
      .split("/")
      .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce((value, part) => value?.[part], document)
  }
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== "object") return
    if (
      typeof value.$ref === "string" &&
      value.$ref.startsWith("#/") &&
      !resolveReference(value.$ref)
    ) {
      throw new Error(`Generated OpenAPI has a dangling $ref: ${value.$ref}`)
    }
    Object.values(value).forEach(visit)
  }
  visit(document)
}

function checkFile(path, expected) {
  if (readFileSync(path, "utf8") !== expected) {
    throw new Error(`${path} is stale; run pnpm generate:contracts`)
  }
}

const prettierOptions = await resolveConfig(routesPath)
if (!prettierOptions) throw new Error("Prettier configuration is unavailable")
const openapi = await format(generateOpenapi(), {
  ...prettierOptions,
  filepath: openapiPath,
})
const routes = await format(generateRoutes(), {
  ...prettierOptions,
  filepath: routesPath,
})
assertCoverage(openapi, routes)
if (checking) {
  checkFile(openapiPath, openapi)
  checkFile(routesPath, routes)
} else {
  writeFileSync(openapiPath, openapi)
  writeFileSync(routesPath, routes)
}
