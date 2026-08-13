import { Injectable } from "@nestjs/common"
import type { NodeHandler } from "./node-handler.interface"

@Injectable()
export class StartNode implements NodeHandler {
  execute(_config: Record<string, unknown>, input: unknown): Promise<unknown> {
    return Promise.resolve(input)
  }
}
