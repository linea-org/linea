const SECRET_KEY =
  /authorization|api[-_]?key|token|secret|password|bearer|cookie/i
const URL_CREDENTIALS = /:\/\/[^/\s:@]+:[^/\s@]+@/
const URL_SECRET_PARAM =
  /[?&](api[-_]?key|token|access_token|secret|key|password)=[^&\s]+/i

// Shapes of well-known secrets, which give themselves away wherever they appear, whatever the key is called.
const TOKEN_SHAPES = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/i,
]

/** Where a graph holds what looks like a literal credential, as "node.path" strings. Publishing shares the graph, so these must be moved out first. */
export function findLiteralCredentials(graph: {
  nodes?: { id?: unknown; config?: unknown }[]
}): string[] {
  const found: string[] = []
  const visit = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      if (
        URL_CREDENTIALS.test(value) ||
        URL_SECRET_PARAM.test(value) ||
        TOKEN_SHAPES.some((shape) => shape.test(value))
      ) {
        found.push(path)
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (typeof value !== 'object' || value === null) return
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY.test(key) && typeof child === 'string' && child.trim()) {
        found.push(`${path}.${key}`)
      } else {
        visit(child, `${path}.${key}`)
      }
    }
  }
  for (const node of graph.nodes ?? []) {
    visit(node.config, typeof node.id === 'string' ? node.id : 'node')
  }
  return found
}
