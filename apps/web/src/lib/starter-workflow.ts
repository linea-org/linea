import type { JsonValue } from "./executions-api"

export const STARTER_APPLICATION = {
  name: "My first app",
  slug: "my-first-app",
}

export const STARTER_WORKFLOW = {
  name: "Starter workflow",
  slug: "starter-workflow",
  description: "A single AI step you can chat with, ready to extend.",
}

export const starterGraph: Record<string, JsonValue> = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  nodes: [
    {
      id: "start",
      type: "start",
      config: { triggerType: "manual" },
      position: { x: 80, y: 180 },
    },
    {
      id: "answer",
      type: "ai",
      config: {
        model: "claude-haiku-4-5-20251001",
        systemPrompt: "You are a helpful assistant. Keep answers short.",
        prompt: "Answer the user's message.",
      },
      position: { x: 360, y: 180 },
    },
    { id: "end", type: "end", config: {}, position: { x: 640, y: 180 } },
  ],
  edges: [
    { from: "start", to: "answer" },
    { from: "answer", to: "end" },
  ],
}

export function uniqueSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}
