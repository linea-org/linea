import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@linea/ui/components/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
import { cn } from "@linea/ui/lib/utils"

import { CopyButton } from "@/components/copy-button"
import type { JsonValue } from "@/lib/executions-api"
import { formatJson } from "./execution-step-presentation"

function isJsonObject(
  value: JsonValue | null
): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function PayloadTable({
  entries,
}: Readonly<{ entries: [string, JsonValue][] }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-48 px-4 font-normal text-muted-foreground">
            Item
          </TableHead>
          <TableHead className="px-4 font-normal text-muted-foreground">
            Value
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([key, entry]) => (
          <TableRow key={key}>
            <TableCell className="px-4 align-top font-mono text-muted-foreground">
              {key}
            </TableCell>
            <TableCell className="px-4 break-words whitespace-pre-wrap">
              {typeof entry === "string" ? (
                entry
              ) : (
                <pre className="font-mono whitespace-pre-wrap">
                  {formatJson(entry)}
                </pre>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PayloadBody({
  label,
  value,
  asJson,
}: Readonly<{ label: string; value: JsonValue | null; asJson: boolean }>) {
  if (value === null) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No {label.toLowerCase()} recorded.
      </p>
    )
  }
  if (asJson || !isJsonObject(value)) {
    return (
      <pre className="max-h-72 overflow-auto p-4 font-mono text-sm break-words whitespace-pre-wrap">
        {formatJson(value)}
      </pre>
    )
  }
  const entries = Object.entries(value)
  if (entries.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Empty object.</p>
  }
  return <PayloadTable entries={entries} />
}

export function StepPayloadCard({
  label,
  value,
}: Readonly<{ label: string; value: JsonValue | null }>) {
  const [asJson, setAsJson] = useState(false)
  const canSwitch = value !== null && isJsonObject(value)
  return (
    <Collapsible defaultOpen>
      <Card size="sm" className="gap-0 py-0">
        <div className="flex items-center gap-1 px-4 py-2">
          <h3 className="mr-auto text-sm font-medium">{label}</h3>
          {canSwitch ? (
            <div className="mr-2 flex rounded-md bg-muted p-0.5">
              {(["Formatted", "JSON"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={
                    (option === "JSON") === asJson ? "secondary" : "ghost"
                  }
                  size="xs"
                  className="h-6"
                  aria-pressed={(option === "JSON") === asJson}
                  onClick={() => setAsJson(option === "JSON")}
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : null}
          {value === null ? null : (
            <CopyButton
              text={formatJson(value)}
              label={label.toLowerCase()}
              size="icon-xs"
            />
          )}
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Toggle ${label.toLowerCase()}`}
                className="group/trigger"
              />
            }
          >
            <ChevronDownIcon
              className={cn(
                "transition-transform group-data-panel-open/trigger:rotate-180"
              )}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t">
            <PayloadBody label={label} value={value} asJson={asJson} />
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
