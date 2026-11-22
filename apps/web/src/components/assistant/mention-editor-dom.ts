import {
  findMentionTrigger,
  mentionLabel,
  parseMentions,
  serializeSegments,
  type MentionRef,
  type MessageSegment,
} from "./mention-text"

export type MentionTriggerAtCaret = {
  query: string
  node: Text
  start: number
  end: number
}

let chipCount = 0

export function createChipHost(ref: MentionRef, label: string): HTMLElement {
  const host = document.createElement("span")
  host.setAttribute("contenteditable", "false")
  host.dataset.mentionKind = ref.kind
  host.dataset.mentionId = ref.id
  host.dataset.label = label
  host.dataset.chipKey = String(++chipCount)
  // Clicking a chip's X must not pull focus, and the caret, out of the editor.
  host.addEventListener("mousedown", (event) => event.preventDefault())
  host.className = "mx-0.5 inline-block align-middle"
  return host
}

export function isChipHost(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.mentionKind !== undefined
}

export function chipHosts(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-mention-kind]")]
}

export function readSegments(root: Node): MessageSegment[] {
  const segments: MessageSegment[] = []
  for (const child of root.childNodes) {
    if (isChipHost(child)) {
      segments.push({
        type: "mention",
        kind: child.dataset.mentionKind as MentionRef["kind"],
        id: child.dataset.mentionId ?? "",
      })
    } else if (child instanceof Text) {
      segments.push({ type: "text", text: child.data })
    } else if (child.nodeName === "BR") {
      // The editor's closing BR is only the browser's placeholder for an empty last line; a BR
      // ending a copied fragment is a real line break.
      const parent = child.parentNode
      if (parent instanceof DocumentFragment || child !== parent?.lastChild) {
        segments.push({ type: "text", text: "\n" })
      }
    } else {
      segments.push(...readSegments(child))
    }
  }
  return segments
}

export const serializeEditor = (root: Node) =>
  serializeSegments(readSegments(root))

function segmentNodes(segments: MessageSegment[]): Node[] {
  return segments.map((segment) =>
    segment.type === "text"
      ? document.createTextNode(segment.text)
      : createChipHost(segment, mentionLabel(segment))
  )
}

export function renderText(root: HTMLElement, text: string) {
  root.replaceChildren(...segmentNodes(parseMentions(text)))
}

function selectionRange(root: HTMLElement): Range | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  return root.contains(range.commonAncestorContainer) ? range : null
}

export function placeCaret(root: HTMLElement, range: Range) {
  const selection = root.ownerDocument.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function caretAfter(root: HTMLElement, node: Node) {
  const range = root.ownerDocument.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  placeCaret(root, range)
}

export function caretAtEnd(root: HTMLElement) {
  const range = root.ownerDocument.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  placeCaret(root, range)
}

/** Inserts pasted text at the caret, turning any references in it into chips. */
export function insertTextAtCaret(root: HTMLElement, text: string) {
  const range = selectionRange(root)
  if (!range) caretAtEnd(root)
  const target = selectionRange(root)
  if (!target) return
  target.deleteContents()
  const nodes = segmentNodes(parseMentions(text))
  const fragment = document.createDocumentFragment()
  fragment.append(...nodes)
  target.insertNode(fragment)
  const last = nodes.at(-1)
  if (last) caretAfter(root, last)
}

export function mentionTriggerAtCaret(
  root: HTMLElement
): MentionTriggerAtCaret | null {
  const range = selectionRange(root)
  if (!range?.collapsed || !(range.startContainer instanceof Text)) return null
  const node = range.startContainer
  const before = node.data.slice(0, range.startOffset)
  const trigger = findMentionTrigger(before, before.length)
  if (!trigger) return null
  return {
    query: trigger.query,
    node,
    start: trigger.start,
    end: range.startOffset,
  }
}

export function insertMentionAtTrigger(
  root: HTMLElement,
  trigger: MentionTriggerAtCaret,
  ref: MentionRef,
  name: string
) {
  const range = root.ownerDocument.createRange()
  range.setStart(trigger.node, trigger.start)
  range.setEnd(trigger.node, trigger.end)
  range.deleteContents()
  const host = createChipHost(ref, mentionLabel(ref, name))
  range.insertNode(host)
  caretAfter(root, host)
}

function isEmptyText(node: Node | null): boolean {
  return node instanceof Text && node.data === ""
}

/** The chip touching the caret on the given side, if the selection is a bare caret. */
export function chipNextToCaret(
  root: HTMLElement,
  side: "before" | "after"
): HTMLElement | null {
  const range = selectionRange(root)
  if (!range?.collapsed) return null
  const { startContainer: container, startOffset: offset } = range
  let neighbour: Node | null
  if (container instanceof Text) {
    const atEdge =
      side === "before" ? offset === 0 : offset === container.length
    if (!atEdge) return null
    neighbour =
      side === "before" ? container.previousSibling : container.nextSibling
  } else {
    neighbour = container.childNodes[side === "before" ? offset - 1 : offset]
  }
  while (isEmptyText(neighbour)) {
    neighbour =
      side === "before"
        ? (neighbour?.previousSibling ?? null)
        : (neighbour?.nextSibling ?? null)
  }
  return isChipHost(neighbour) ? neighbour : null
}

export function removeChip(root: HTMLElement, chip: HTMLElement) {
  const range = root.ownerDocument.createRange()
  range.setStartBefore(chip)
  range.collapse(true)
  chip.remove()
  placeCaret(root, range)
}

/** The selected part of the message as plain reference text, or null for a bare caret. */
export function selectedMessageText(root: HTMLElement): string | null {
  const range = selectionRange(root)
  if (!range || range.collapsed) return null
  const fragment = range.cloneContents()
  // Whether the closing BR was selected is only known from the live range: in the clone it
  // looks the same as a line break that ends a copied line.
  const placeholder = root.lastChild
  if (
    placeholder?.nodeName === "BR" &&
    range.intersectsNode(placeholder) &&
    fragment.lastChild?.nodeName === "BR"
  ) {
    fragment.lastChild.remove()
  }
  return serializeEditor(fragment)
}

export function deleteSelection(root: HTMLElement) {
  selectionRange(root)?.deleteContents()
}
