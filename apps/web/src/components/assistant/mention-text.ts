export const MENTION_KINDS = ["run", "workflow", "application"] as const

export type MentionKind = (typeof MENTION_KINDS)[number]

export type MentionCandidate = {
  kind: MentionKind
  /** The full id: Inky's get_run only accepts a complete run id. */
  id: string
  label: string
  detail: string
}

export type MentionRef = Pick<MentionCandidate, "kind" | "id">

export type MentionTrigger = { start: number; query: string }

const TRIGGER = /(?:^|\s)@([\p{L}\p{N}_:-]*)$/u

/** The "@" being typed just before the caret, if it starts a word. */
export function findMentionTrigger(
  text: string,
  caret: number
): MentionTrigger | null {
  const match = TRIGGER.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1]
  return { start: caret - query.length - 1, query }
}

export const mentionKey = (candidate: MentionRef) =>
  `${candidate.kind}:${candidate.id}`

export function mentionReference(candidate: MentionRef): string {
  return `@${candidate.kind}:${candidate.id}`
}

export type MessageSegment =
  { type: "text"; text: string } | ({ type: "mention" } & MentionRef)

const REFERENCE =
  /(?<!\S)@(run|workflow|application):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![\w-])/gi

/** Splits message text into plain runs and the references in it. */
export function parseMentions(text: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  let last = 0
  for (const match of text.matchAll(REFERENCE)) {
    if (match.index > last) {
      segments.push({ type: "text", text: text.slice(last, match.index) })
    }
    segments.push({
      type: "mention",
      kind: match[1].toLowerCase() as MentionKind,
      id: match[2].toLowerCase(),
    })
    last = match.index + match[0].length
  }
  if (last < text.length)
    segments.push({ type: "text", text: text.slice(last) })
  return segments
}

/** Spaces keep a reference its own token: before it always, after it where text would join the id. */
export function serializeSegments(segments: MessageSegment[]): string {
  let out = ""
  let afterMention = false
  for (const segment of segments) {
    if (segment.type === "mention") {
      if (out && !/\s$/.test(out)) out += " "
      out += mentionReference(segment)
      afterMention = true
    } else if (segment.text) {
      if (afterMention && /^[\w-]/.test(segment.text)) out += " "
      out += segment.text
      afterMention = false
    }
  }
  return out
}

const MAX_PER_KIND = 8

/** "run:abc" narrows to runs whose label or id contains "abc"; plain text also matches the kind. */
export function filterMentions(
  candidates: MentionCandidate[],
  query: string
): MentionCandidate[] {
  const separator = query.indexOf(":")
  const kind = MENTION_KINDS.find(
    (item) => separator > 0 && item === query.slice(0, separator)
  )
  const needle = (kind ? query.slice(separator + 1) : query).toLowerCase()
  return MENTION_KINDS.flatMap((group) =>
    candidates
      .filter(
        (candidate) =>
          candidate.kind === group &&
          (!kind || kind === group) &&
          `${candidate.kind} ${candidate.label} ${candidate.id}`
            .toLowerCase()
            .includes(needle)
      )
      .slice(0, MAX_PER_KIND)
  )
}

/** Runs have no name of their own, so their chip shows the short id; others show `name`. */
export function mentionLabel(ref: MentionRef, name?: string): string {
  return ref.kind === "run" || !name
    ? `${ref.kind} ${ref.id.slice(0, 8)}`
    : name
}
