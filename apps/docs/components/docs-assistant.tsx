"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook"
import {
  ArrowUp,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

type AssistantSource = {
  title: string
  url: string
}

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: AssistantSource[] }

type AssistantResponse = {
  answer: string
  sources: AssistantSource[]
}

const suggestions = [
  "Explain this page",
  "What are the security implications?",
  "Show me the execution flow",
]
const MAX_HISTORY_MESSAGES = 10

function isAssistantSource(value: unknown): value is AssistantSource {
  return Boolean(
    value &&
    typeof value === "object" &&
    "title" in value &&
    typeof value.title === "string" &&
    "url" in value &&
    typeof value.url === "string"
  )
}

function isAssistantResponse(value: unknown): value is AssistantResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("answer" in value) ||
    !("sources" in value)
  )
    return false
  if (typeof value.answer !== "string" || !Array.isArray(value.sources))
    return false
  return value.sources.every(isAssistantSource)
}

async function getErrorMessage(response: Response) {
  const value: unknown = await response.json().catch(() => undefined)
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error
  }
  return "The docs assistant could not answer right now."
}

export function DocsMobileAskTrigger() {
  const { open } = useNotebookLayout().slots.sidebar.useSidebar()
  if (open) return null
  return (
    <div className="fixed right-4 bottom-2 z-30 md:hidden">
      <DocsAssistant trigger="floating" />
    </div>
  )
}

export function DocsAssistant({ trigger }: { trigger: "header" | "floating" }) {
  const pathname = usePathname()
  const questionId = useId()
  const threadRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [pageTitle, setPageTitle] = useState("Linea documentation")
  useEffect(() => {
    setPageTitle(document.title.split(" | ")[0] || "Linea documentation")
  }, [pathname])
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, isLoading])
  async function askDocs(nextQuestion: string) {
    const content = nextQuestion.trim()
    if (!content || isLoading) return
    const history = messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
      role: message.role,
      content: message.content,
    }))
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }]
    setMessages(nextMessages)
    setDraft("")
    setError(undefined)
    setIsLoading(true)
    try {
      const response = await fetch("/api/docs-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content }],
          currentPath: pathname.startsWith("/docs") ? pathname : undefined,
        }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response))
      const value: unknown = await response.json()
      if (!isAssistantResponse(value))
        throw new Error("The docs assistant returned an invalid response.")
      setMessages([
        ...nextMessages,
        { role: "assistant", content: value.answer, sources: value.sources },
      ])
    } catch (caught) {
      setMessages((currentMessages) => currentMessages.slice(0, -1))
      setError(
        caught instanceof Error
          ? caught.message
          : "The docs assistant could not answer right now."
      )
    } finally {
      setIsLoading(false)
    }
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void askDocs(draft)
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    void askDocs(draft)
  }
  function resetChat() {
    setMessages([])
    setDraft("")
    setError(undefined)
  }
  return (
    <Dialog.Root modal="trap-focus">
      <Dialog.Trigger
        className={`border-fd-border bg-fd-card hover:bg-fd-accent focus-visible:ring-fd-ring flex cursor-pointer items-center justify-center rounded-md border text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none ${trigger === "header" ? "h-9 gap-2 px-3" : "size-10"}`}
        data-docs-ask-fab={trigger === "floating" ? "" : undefined}
      >
        <MessageCircle className="size-4" />
        {trigger === "header" && <span>Ask Linea</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-xs transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          data-docs-chat=""
          className="border-fd-border bg-fd-popover text-fd-popover-foreground fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l shadow-2xl transition duration-200 data-ending-style:translate-x-12 data-ending-style:opacity-0 data-starting-style:translate-x-12 data-starting-style:opacity-0"
        >
          <header className="border-fd-border flex h-12 items-center gap-3 border-b px-4">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <Dialog.Title className="font-display shrink-0 text-sm font-semibold tracking-tight">
                Ask Linea
              </Dialog.Title>
              <Dialog.Description className="text-fd-muted-foreground truncate text-xs">
                {pageTitle}
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1">
              {(messages.length > 0 || error) && (
                <button
                  type="button"
                  onClick={resetChat}
                  className="hover:bg-fd-accent focus-visible:ring-fd-ring cursor-pointer rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <RotateCcw className="size-4" />
                  <span className="sr-only">Start a new chat</span>
                </button>
              )}
              <Dialog.Close className="hover:bg-fd-accent focus-visible:ring-fd-ring cursor-pointer rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none">
                <X className="size-4" />
                <span className="sr-only">Close chat</span>
              </Dialog.Close>
            </div>
          </header>
          <div
            ref={threadRef}
            aria-live="polite"
            className="flex-1 overflow-y-auto px-5 py-4"
          >
            {messages.length === 0 && !isLoading && !error && (
              <div>
                <p className="text-fd-muted-foreground text-sm">
                  Ask a follow-up after the first answer. The thread stays on
                  this page.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void askDocs(suggestion)}
                      className="border-fd-border hover:bg-fd-accent cursor-pointer rounded-md border px-3 py-2.5 text-left text-sm transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-4">
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <p
                    key={`${message.role}-${index}`}
                    className="bg-fd-secondary text-fd-secondary-foreground ms-8 rounded-md px-3 py-2 text-sm leading-6"
                  >
                    {message.content}
                  </p>
                ) : (
                  <div key={`${message.role}-${index}`} className="me-4">
                    <p className="text-sm leading-7 whitespace-pre-wrap">
                      {message.content}
                    </p>
                    {message.sources.length > 0 && (
                      <div className="mt-3 flex flex-col gap-1.5">
                        {message.sources.map((source, sourceIndex) => (
                          <Link
                            key={source.url}
                            href={source.url}
                            className="text-fd-muted-foreground hover:text-fd-foreground text-xs"
                          >
                            [{sourceIndex + 1}] {source.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
              {isLoading && (
                <div className="text-fd-muted-foreground flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 animate-spin" />
                  Reading the docs…
                </div>
              )}
              {error && (
                <p className="text-fd-muted-foreground text-sm">{error}</p>
              )}
            </div>
          </div>
          <form
            onSubmit={handleSubmit}
            className="border-fd-border border-t px-3 py-2.5"
          >
            <label htmlFor={questionId} className="sr-only">
              Message
            </label>
            <div className="border-fd-border bg-fd-background focus-within:ring-fd-ring flex items-end gap-1.5 rounded-md border p-1.5 focus-within:ring-2">
              <textarea
                id={questionId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this page…"
                rows={2}
                maxLength={500}
                className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isLoading}
                className="bg-fd-primary text-fd-primary-foreground disabled:bg-fd-muted disabled:text-fd-muted-foreground flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
                <span className="sr-only">Send</span>
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
