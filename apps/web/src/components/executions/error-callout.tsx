import { useState } from "react"
import { ChevronDownIcon, CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@linea/ui/components/alert"
import { cn } from "@linea/ui/lib/utils"

type ErrorCalloutProps = {
  title: string
  message: string
}

function splitErrorMessage(message: string): {
  summary: string
  rest?: string
} {
  const trimmed = message.trim()
  if (!trimmed) return { summary: "Something went wrong." }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      return {
        summary: "The run returned an error payload.",
        rest: JSON.stringify(parsed, null, 2),
      }
    } catch {
      return { summary: trimmed }
    }
  }
  const stackMatch = /\n\s+at\s/.exec(trimmed)
  if (stackMatch?.index !== undefined) {
    const summary = trimmed.slice(0, stackMatch.index).trim()
    const rest = trimmed.slice(stackMatch.index).trim()
    return { summary: summary || "Something went wrong.", rest }
  }
  const newline = trimmed.indexOf("\n")
  if (newline !== -1) {
    return {
      summary: trimmed.slice(0, newline).trim(),
      rest: trimmed.slice(newline + 1).trim(),
    }
  }
  return { summary: trimmed }
}

export function ErrorCallout({ title, message }: ErrorCalloutProps) {
  const { summary, rest } = splitErrorMessage(message)
  const details = rest ?? ""
  const [open, setOpen] = useState(false)
  return (
    <Alert
      variant="destructive"
      className="border-destructive/30 bg-destructive/10"
    >
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="break-words whitespace-pre-wrap text-foreground">
          {summary}
        </p>
        {details ? (
          <div className="mt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              onClick={() => setOpen((current) => !current)}
            >
              <ChevronDownIcon
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-180"
                )}
              />
              {open ? "Hide details" : "Show details"}
            </button>
            {open ? (
              <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-background/70 p-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground">
                {details}
              </pre>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
