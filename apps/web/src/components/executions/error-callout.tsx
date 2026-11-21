import { useState, type ReactNode } from "react"
import { ChevronDownIcon, CircleAlertIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@linealabs/ui/components/alert"
import { cn } from "@linealabs/ui/lib/utils"

type ErrorCalloutProps = {
  title: string
  message: string
  details?: string
  action?: ReactNode
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

export function ErrorCallout({
  title,
  message,
  details: givenDetails,
  action,
}: Readonly<ErrorCalloutProps>) {
  const split = splitErrorMessage(message)
  const summary = givenDetails === undefined ? split.summary : message
  const details = givenDetails ?? split.rest ?? ""
  const [open, setOpen] = useState(false)
  return (
    <Alert
      variant="destructive"
      className={cn(
        "border-destructive/30",
        details
          ? "has-data-[slot=alert-action]:pr-64"
          : "has-data-[slot=alert-action]:pr-40"
      )}
    >
      <CircleAlertIcon />
      {action || details ? (
        <AlertAction
          className={cn(
            "right-4 flex items-center gap-2",
            open ? "top-3" : "top-1/2 -translate-y-1/2"
          )}
        >
          {details ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setOpen((current) => !current)}
            >
              {open ? "Hide details" : "Show details"}
              <ChevronDownIcon
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-180"
                )}
              />
            </Button>
          ) : null}
          {action}
        </AlertAction>
      ) : null}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="mb-0! break-words whitespace-pre-wrap text-foreground">
          {summary}
        </p>
        {details && open ? (
          <pre className="mt-2 -mr-60 max-h-56 overflow-auto rounded-md bg-background/70 p-2.5 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
            {details}
          </pre>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
