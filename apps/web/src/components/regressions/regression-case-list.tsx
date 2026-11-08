import { EllipsisVerticalIcon, FlaskConicalIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
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
      </Empty>
    )
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 font-normal text-muted-foreground">
              Case
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Type
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Source
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Created
            </TableHead>
            <TableHead className="w-12 px-2">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((regressionCase) => (
            <TableRow key={regressionCase.id} className="hover:bg-muted/40">
              <TableCell className="max-w-md px-4 py-3">
                <p className="truncate text-xs font-medium">
                  {caseSummary(regressionCase)}
                </p>
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {caseTypeLabel[regressionCase.caseType]}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {sourceLabel(regressionCase) ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                {new Date(regressionCase.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="px-2 py-3 text-right">
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
    </div>
  )
}
