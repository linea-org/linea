import type { JsonValue } from "./executions-api"

export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  // Always built from the model the workspace chose: no template carries a default of its own.
  build: (model: string) => Record<string, JsonValue>
}

function node(
  id: string,
  type: string,
  config: Record<string, JsonValue>,
  x: number,
  y = 180
): JsonValue {
  return { id, type, config, position: { x, y } }
}

function startNode(config: Record<string, JsonValue>): JsonValue {
  return { id: "start", type: "start", config, position: { x: 80, y: 180 } }
}

function edge(from: string, to: string, condition?: string): JsonValue {
  return condition === undefined ? { from, to } : { from, to, condition }
}

function aiNode(
  model: string,
  systemPrompt: string,
  prompt: string,
  x: number,
  y = 180
): JsonValue {
  return {
    id: "answer",
    type: "ai",
    config: { model, systemPrompt, prompt },
    position: { x, y },
  }
}

function endNode(id: string, x: number, y = 180): JsonValue {
  return { id, type: "end", config: {}, position: { x, y } }
}

function chatGraph(
  model: string,
  systemPrompt: string,
  prompt: string
): Record<string, JsonValue> {
  return {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "start",
    nodes: [
      startNode({ triggerType: "manual" }),
      aiNode(model, systemPrompt, prompt, 360),
      endNode("end", 640),
    ],
    edges: [edge("start", "answer"), edge("answer", "end")],
  }
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "chat-assistant",
    name: "Chat assistant",
    description: "A single AI step you can chat with, ready to extend.",
    build: (model) =>
      chatGraph(
        model,
        "You are a helpful assistant. Keep answers short.",
        "Answer the user's message."
      ),
  },
  {
    id: "support-triage",
    name: "Support ticket triage",
    description:
      "Classify a ticket from a webhook with a model, then route it to the right team. Replace the placeholder URLs.",
    build: (model) => ({
      version: 1,
      trigger: { type: "webhook" },
      entryNodeId: "start",
      nodes: [
        startNode({ triggerType: "webhook" }),
        node(
          "classify",
          "extract",
          {
            model,
            sourcePath: "text",
            instructions:
              "Read the support ticket and decide its category and how urgent it is.",
            schema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: ["billing", "technical", "other"],
                },
                urgency: { type: "string", enum: ["low", "normal", "high"] },
                summary: { type: "string" },
              },
              required: ["category", "urgency", "summary"],
            },
          },
          340
        ),
        node("pick", "transform", { expression: "data.category" }, 600),
        node(
          "route",
          "branch",
          {
            cases: {
              billing: { output: "billing" },
              technical: { output: "technical" },
            },
            defaultBranch: "other",
          },
          860
        ),
        node(
          "notify-billing",
          "http",
          {
            url: "https://hooks.example.com/billing",
            method: "POST",
            body: {
              text: "Billing ticket ({{steps.classify.data.urgency}}): {{steps.classify.data.summary}}",
            },
          },
          1140,
          60
        ),
        node(
          "notify-technical",
          "http",
          {
            url: "https://hooks.example.com/technical",
            method: "POST",
            body: {
              text: "Technical ticket ({{steps.classify.data.urgency}}): {{steps.classify.data.summary}}",
            },
          },
          1140,
          180
        ),
        endNode("billing-done", 1420, 60),
        endNode("technical-done", 1420, 180),
        endNode("other-done", 1140, 300),
      ],
      edges: [
        edge("start", "classify"),
        edge("classify", "pick"),
        edge("pick", "route"),
        edge("route", "notify-billing", "billing"),
        edge("route", "notify-technical", "technical"),
        edge("route", "other-done", "other"),
        edge("notify-billing", "billing-done"),
        edge("notify-technical", "technical-done"),
      ],
    }),
  },
  {
    id: "content-review",
    name: "Content review",
    description:
      "Draft a post with a model, pause for a human to approve it, then publish or discard.",
    build: (model) => ({
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        startNode({ triggerType: "manual" }),
        aiNode(
          model,
          "You write concise, friendly product update posts.",
          "Draft a short product update post.",
          340
        ),
        node(
          "review",
          "approval",
          { message: "Review the drafted post before it is published." },
          600
        ),
        node("decision", "transform", { expression: "approved" }, 860),
        node(
          "route",
          "branch",
          {
            cases: { approved: { output: true }, rejected: { output: false } },
            defaultBranch: "rejected",
          },
          1120
        ),
        node(
          "publish",
          "http",
          {
            url: "https://hooks.example.com/publish",
            method: "POST",
            body: { text: "{{steps.answer.text}}" },
          },
          1400,
          100
        ),
        endNode("published", 1680, 100),
        endNode("discarded", 1400, 260),
      ],
      edges: [
        edge("start", "answer"),
        edge("answer", "review"),
        edge("review", "decision"),
        edge("decision", "route"),
        edge("route", "publish", "approved"),
        edge("route", "discarded", "rejected"),
        edge("publish", "published"),
      ],
    }),
  },
  {
    id: "status-monitor",
    name: "Status monitor",
    description:
      "Check an endpoint every 15 minutes. If it is down, alert, wait five minutes, and check again.",
    build: () => ({
      version: 1,
      trigger: { type: "schedule", cron: "*/15 * * * *", timezone: "UTC" },
      entryNodeId: "start",
      nodes: [
        startNode({
          triggerType: "schedule",
          cron: "*/15 * * * *",
          timezone: "UTC",
        }),
        node(
          "check",
          "http",
          { url: "https://status.example.com/api/health", method: "GET" },
          340
        ),
        node("code", "transform", { expression: "status" }, 600),
        node(
          "route",
          "branch",
          {
            cases: { healthy: { output: 200 } },
            defaultBranch: "degraded",
          },
          860
        ),
        endNode("ok", 1140, 80),
        node(
          "alert",
          "http",
          {
            url: "https://hooks.example.com/alerts",
            method: "POST",
            body: { text: "The endpoint returned {{steps.check.status}}" },
          },
          1140,
          260
        ),
        node(
          "settle",
          "wait",
          { mode: "duration", amount: 5, unit: "minutes" },
          1420,
          260
        ),
        node(
          "recheck",
          "http",
          { url: "https://status.example.com/api/health", method: "GET" },
          1700,
          260
        ),
        endNode("rechecked", 1980, 260),
      ],
      edges: [
        edge("start", "check"),
        edge("check", "code"),
        edge("code", "route"),
        edge("route", "ok", "healthy"),
        edge("route", "alert", "degraded"),
        edge("alert", "settle"),
        edge("settle", "recheck"),
        edge("recheck", "rechecked"),
      ],
    }),
  },
  {
    id: "todo-router",
    name: "Todo router",
    description: "Fetch a todo, then route on whether it is done.",
    build: (model) => ({
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        startNode({ triggerType: "manual" }),
        node(
          "fetch",
          "http",
          {
            url: "https://jsonplaceholder.typicode.com/todos/1",
            method: "GET",
          },
          340
        ),
        node("pick", "transform", { expression: "body.completed" }, 600),
        node(
          "route",
          "branch",
          {
            cases: { pending: { output: false }, done: { output: true } },
            defaultBranch: "pending",
          },
          860
        ),
        aiNode(
          model,
          "You are a concise productivity assistant.",
          "Suggest one next action for this to-do item, in a single sentence: {{steps.fetch.body.title}}",
          1140,
          120
        ),
        endNode("end", 1420, 120),
        endNode("done", 1140, 300),
      ],
      edges: [
        edge("start", "fetch"),
        edge("fetch", "pick"),
        edge("pick", "route"),
        edge("route", "answer", "pending"),
        edge("route", "done", "done"),
        edge("answer", "end"),
      ],
    }),
  },
  {
    id: "weekday-briefing",
    name: "Weekday briefing",
    description: "Every weekday at 9am, write a short briefing for the day.",
    build: (model) => ({
      version: 1,
      trigger: { type: "schedule", cron: "0 9 * * 1-5", timezone: "UTC" },
      entryNodeId: "start",
      nodes: [
        startNode({
          triggerType: "schedule",
          cron: "0 9 * * 1-5",
          timezone: "UTC",
        }),
        aiNode(
          model,
          "You write short, upbeat morning briefings.",
          "Write a three-sentence briefing to start a working day.",
          360
        ),
        endNode("end", 640),
      ],
      edges: [edge("start", "answer"), edge("answer", "end")],
    }),
  },
  {
    id: "repo-explainer",
    name: "Repo explainer",
    description:
      "Answer questions about a GitHub repo with DeepWiki's MCP tools.",
    build: (model) => ({
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        startNode({ triggerType: "manual" }),
        node(
          "answer",
          "ai",
          {
            model,
            systemPrompt:
              "You explain codebases briefly. Look things up with your tools before answering.",
            prompt:
              "In three sentences, what is the GitHub repo modelcontextprotocol/typescript-sdk for?",
            mcpServers: [
              {
                name: "deepwiki",
                url: "https://mcp.deepwiki.com/mcp",
                tools: ["read_wiki_structure", "ask_wiki_question"],
              },
            ],
          },
          360
        ),
        endNode("end", 640),
      ],
      edges: [edge("start", "answer"), edge("answer", "end")],
    }),
  },
]

export function findTemplate(id: string): WorkflowTemplate {
  const template = workflowTemplates.find((item) => item.id === id)
  if (!template) throw new Error(`Unknown template: ${id}`)
  return template
}
