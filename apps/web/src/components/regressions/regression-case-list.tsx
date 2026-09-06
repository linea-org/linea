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

import type { RegressionCase } from "@/lib/regression-cases-api"

const caseTypeLabel: Record<RegressionCase["caseType"], string> = {
  node: "Node",
  conversation: "Conversation",
}

function caseSummary(regressionCase: RegressionCase): string {
  if (regressionCase.caseType === "node") {
    return regressionCase.nodeId ?? "—"
  }
  const finalPrompt = regressionCase.input.finalPrompt
  return typeof finalPrompt === "string" ? finalPrompt : "—"
}

function sourceLabel(regressionCase: RegressionCase): string | null {
  if (regressionCase.sourceStepId) return "From execution step"
  if (regressionCase.sourceSignalId) return "From signal"
  if (regressionCase.sourceFindingId) return "From finding"
  return null
}

export function RegressionCaseList({
  cases,
  onArchive,
}: {
  cases: RegressionCase[]
  onArchive: (regressionCase: RegressionCase) => void
}) {
  if (cases.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FlaskConicalIcon />
          </EmptyMedia>
          <EmptyTitle>No regression cases yet</EmptyTitle>
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
        {cases.map((regressionCase) => (
          <TableRow key={regressionCase.id}>
            <TableCell>
              <Badge variant="outline">
                {caseTypeLabel[regressionCase.caseType]}
              </Badge>
            </TableCell>
            <TableCell className="max-w-xs truncate text-foreground">
              {caseSummary(regressionCase)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {sourceLabel(regressionCase) ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(regressionCase.createdAt).toLocaleString()}
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
                  <DropdownMenuItem onClick={() => onArchive(regressionCase)}>
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
