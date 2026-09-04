import { EllipsisVerticalIcon, FlaskConicalIcon } from "lucide-react"

import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import type { EvalCase } from "@/lib/eval-cases-api"

const caseTypeLabel: Record<EvalCase["caseType"], string> = {
  node: "Node",
  conversation: "Conversation",
}

function caseSummary(evalCase: EvalCase): string {
  if (evalCase.caseType === "node") {
    return evalCase.nodeId ?? "—"
  }
  const finalPrompt = evalCase.input.finalPrompt
  return typeof finalPrompt === "string" ? finalPrompt : "—"
}

function sourceLabel(evalCase: EvalCase): string | null {
  if (evalCase.sourceStepId) return "From execution step"
  if (evalCase.sourceSignalId) return "From signal"
  if (evalCase.sourceFindingId) return "From finding"
  return null
}

export function EvalCaseList({
  cases,
  onArchive,
}: {
  cases: EvalCase[]
  onArchive: (evalCase: EvalCase) => void
}) {
  if (cases.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FlaskConicalIcon />
          </EmptyMedia>
          <EmptyTitle>No eval cases yet</EmptyTitle>
          <EmptyDescription>
            Snapshot an execution step, or a signal occurrence, to start
            building a regression suite for this workflow.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    )
  }

  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((evalCase) => (
          <TableRow key={evalCase.id}>
            <TableCell>
              <Badge variant="outline">
                {caseTypeLabel[evalCase.caseType]}
              </Badge>
            </TableCell>
            <TableCell className="max-w-xs truncate text-foreground">
              {caseSummary(evalCase)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {sourceLabel(evalCase) ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(evalCase.createdAt).toLocaleString()}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="More options"
                    />
                  }
                >
                  <EllipsisVerticalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 min-w-40">
                  <DropdownMenuItem onClick={() => onArchive(evalCase)}>
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
