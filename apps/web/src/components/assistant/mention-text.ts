export const MENTION_KINDS = ["run", "workflow", "application"] as const

export type MentionKind = (typeof MENTION_KINDS)[number]

export type MentionCandidate = {
  kind: MentionKind
  /** The full id: Inky's get_run only accepts a complete run id. */
  id: string
  label: string
  detail: string
}

export type MentionTrigger = { start: number; query: string }

const TRIGGER = /(?:^|\s)@([\w:-]*)$/

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

export const mentionKey = (candidate: Pick<MentionCandidate, "kind" | "id">) =>
  `${candidate.kind}:${candidate.id}`

export function mentionReference(
  candidate: Pick<MentionCandidate, "kind" | "id">
): string {
  return `@${candidate.kind}:${candidate.id}`
}

/** Replaces the typed "@query" with the reference and a trailing space, and places the caret after. */
export function insertMention(
  text: string,
  caret: number,
  trigger: MentionTrigger,
  candidate: MentionCandidate
): { text: string; caret: number } {
  const inserted = `${mentionReference(candidate)} `
  return {
    text: text.slice(0, trigger.start) + inserted + text.slice(caret),
    caret: trigger.start + inserted.length,
  }
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
