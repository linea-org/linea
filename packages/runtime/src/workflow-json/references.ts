import type { NodeUIField } from "../nodes/node-definition.js"
import { nodeRegistry } from "../nodes/node-registry.js"
import type { WorkflowGraph, WorkflowNode } from "./schema.js"
import { WorkflowGraphError } from "./workflow-graph-error.js"

const ROOTS = ["steps", "input", "variables", "secrets"] as const

export type Reference = {
  root: (typeof ROOTS)[number]
  /** For "steps" the first part is the step's id; for "secrets" the only part is its name. */
  path: string[]
  /** As written, without the braces; the key its value is recorded under. */
  text: string
}

const TOKEN = /(\\?)\{\{([^{}]*)\}\}/g
const ROOT = /^[\w-]+/
const PART = /^(?:\.([\w-]+)|\[(\d+)\]|\["([^"]*)"\])/

/** Undefined when the text does not start with a known root, so it is not a reference at all. */
function parseReference(text: string): Reference | undefined {
  const name = ROOT.exec(text)?.[0]
  const root = ROOTS.find((each) => each === name)
  if (!root) return undefined
  const path: string[] = []
  let rest = text.slice(root.length)
  while (rest !== "") {
    const match = PART.exec(rest)
    if (!match) throw new WorkflowGraphError(`"{{${text}}}" is not valid`)
    path.push(match[1] ?? match[2] ?? match[3])
    rest = rest.slice(match[0].length)
  }
  const isComplete =
    root === "secrets" ? path.length === 1 : root !== "steps" || path.length > 0
  if (!isComplete) throw new WorkflowGraphError(`"{{${text}}}" is not valid`)
  return { root, path, text }
}

/** `strict` refuses braces that are not a reference, which a published graph may already contain. */
function parseTemplate(
  source: string,
  strict: boolean
): (string | Reference)[] {
  const template: (string | Reference)[] = []
  let end = 0
  for (const match of source.matchAll(TOKEN)) {
    const [token, escaped, inner] = match
    const reference = escaped ? undefined : parseReference(inner.trim())
    if (strict && !escaped && !reference) {
      throw new WorkflowGraphError(
        `"${token}" is not a reference. Write "\\${token}" to keep it as text`
      )
    }
    template.push(source.slice(end, match.index))
    template.push(reference ?? (escaped ? token.slice(1) : token))
    end = match.index + token.length
  }
  template.push(source.slice(end))
  return template.filter((part) => part !== "")
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (value === null || typeof value !== "object") return []
  return Object.values(value).flatMap(stringsIn)
}

type ConfiguredNode = Pick<WorkflowNode, "type" | "config">
type FieldReference = { field: NodeUIField; reference: Reference }

function referenceFields({ type, config }: ConfiguredNode): NodeUIField[] {
  const fields: NodeUIField[] = nodeRegistry[type].ui.fields
  return fields.filter(
    ({ references, showIf }) =>
      references &&
      (!showIf || [showIf.equals].flat().some((v) => v === config[showIf.key]))
  )
}

function fieldReferences(
  node: ConfiguredNode,
  strict: boolean
): FieldReference[] {
  return referenceFields(node).flatMap((field) =>
    stringsIn(node.config[field.key])
      .flatMap((text) => parseTemplate(text, strict))
      .filter((part) => typeof part !== "string")
      .map((reference) => ({ field, reference }))
  )
}

const FIXED_ORIGIN = /^https?:\/\/[^/?#\\\s]+(?:[/?#]|$)/i

/** True when no value in the URL can choose where the request goes. */
function hasFixedOrigin(url: unknown): boolean {
  if (typeof url !== "string") return false
  const [first, ...rest] = parseTemplate(url, false)
  if (typeof first !== "string") return false
  const origin = FIXED_ORIGIN.exec(first)?.[0]
  return origin !== undefined && (rest.length === 0 || /[/?#]$/.test(origin))
}

function assertSecretsAllowed(
  node: ConfiguredNode,
  used: FieldReference[]
): void {
  const secrets = used.filter(({ reference }) => reference.root === "secrets")
  for (const { field, reference } of secrets) {
    if (!field.references?.secrets) {
      throw new WorkflowGraphError(
        `"{{${reference.text}}}" can't be used in ${field.label}`
      )
    }
  }
  if (secrets.length > 0 && !hasFixedOrigin(node.config.url)) {
    throw new WorkflowGraphError(
      "A step that uses a secret needs a URL that starts with a fixed address"
    )
  }
}

/** The references a step reads; throws when a secret is used where it can't be. */
export function nodeReferences(node: ConfiguredNode): Reference[] {
  const used = fieldReferences(node, false)
  assertSecretsAllowed(node, used)
  return used.map(({ reference }) => reference)
}

/** Every step that has always finished before this one starts. */
export function stepsBefore(
  graph: Pick<WorkflowGraph, "edges">,
  nodeId: string
): Set<string> {
  const before = new Set<string>()
  const waiting = [nodeId]
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    for (const edge of graph.edges) {
      if (edge.to !== id || before.has(edge.from)) continue
      before.add(edge.from)
      waiting.push(edge.from)
    }
  }
  return before
}

function assertNodeReferences(graph: WorkflowGraph, node: WorkflowNode): void {
  const used = fieldReferences(node, true)
  assertSecretsAllowed(node, used)
  const before = stepsBefore(graph, node.id)
  for (const { reference } of used) {
    if (reference.root === "steps" && !before.has(reference.path[0])) {
      throw new WorkflowGraphError(
        `"{{${reference.text}}}" names a step that does not run before it`
      )
    }
  }
}

/** For newly authored graphs only: a graph published before references existed must keep running. */
export function assertValidReferences(graph: WorkflowGraph): void {
  for (const node of graph.nodes) {
    try {
      assertNodeReferences(graph, node)
    } catch (error) {
      if (!(error instanceof WorkflowGraphError)) throw error
      throw new WorkflowGraphError(`Step "${node.id}": ${error.message}`)
    }
  }
}

export class ReferenceValueError extends Error {}

/** Own properties only, so a path can't reach into a prototype. */
export function readPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (at, key) =>
      at !== null && typeof at === "object" && Object.hasOwn(at, key)
        ? (at as Record<string, unknown>)[key]
        : undefined,
    value
  )
}

function asText(value: unknown): string {
  if (value === null) return ""
  return typeof value === "string" ? value : JSON.stringify(value)
}

function asUrlPart(value: unknown, before: string): string {
  const text = asText(value)
  // An empty or dot path segment would send the request to another resource.
  if (!before.includes("?") && ["", ".", ".."].includes(text)) {
    throw new ReferenceValueError(`"${text}" can't be part of a URL path`)
  }
  return encodeURIComponent(text)
}

type ReadReference = (reference: Reference) => unknown
type ReferenceUse = NonNullable<NodeUIField["references"]>["as"]

function resolveText(
  source: string,
  read: ReadReference,
  as: ReferenceUse
): unknown {
  const template = parseTemplate(source, false)
  if (template.length === 1 && as === "value") {
    const [only] = template
    return typeof only === "string" ? only : read(only)
  }
  let text = ""
  for (const part of template) {
    if (typeof part === "string") text += part
    else if (as === "url" && text !== "") text += asUrlPart(read(part), text)
    else text += asText(read(part))
  }
  return text
}

function resolveValue(
  value: unknown,
  read: ReadReference,
  as: ReferenceUse
): unknown {
  if (typeof value === "string") return resolveText(value, read, as)
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, read, as))
  }
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      resolveValue(item, read, as),
    ])
  )
}

// A short template can repeat a large value until the worker runs out of memory.
const MAX_READ_CHARS = 4_194_304

function withLimit(read: ReadReference): ReadReference {
  let left = MAX_READ_CHARS
  return (reference) => {
    const value = read(reference)
    left -= value === undefined ? 0 : asText(value).length
    if (left < 0) {
      throw new ReferenceValueError(
        "The values this step reads add up to more than 4 MB"
      )
    }
    return value
  }
}

/** Replaces every reference in one pass, so a value that looks like a reference stays text. */
export function resolveReferences(
  node: ConfiguredNode,
  readUnlimited: ReadReference
): Record<string, unknown> {
  const read = withLimit(readUnlimited)
  const config = { ...node.config }
  for (const { key, references } of referenceFields(node)) {
    if (!references || config[key] === undefined) continue
    config[key] = resolveValue(config[key], read, references.as)
  }
  return config
}
