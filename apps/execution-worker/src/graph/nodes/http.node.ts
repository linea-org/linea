import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type { NodeHandler } from "./node-handler.interface"

@Injectable()
export class HttpNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    input: unknown
  ): Promise<unknown> {
    const parsed = nodeRegistry.http.inputSchema.parse({
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: input,
    })

    const response = await fetch(parsed.url, {
      method: parsed.method,
      headers: parsed.headers,
      body: parsed.body === undefined ? undefined : JSON.stringify(parsed.body),
    })

    const contentType = response.headers.get("content-type") ?? ""
    const body: unknown = contentType.includes("application/json")
      ? await response.json()
      : await response.text()

    return nodeRegistry.http.outputSchema.parse({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    })
  }
}
