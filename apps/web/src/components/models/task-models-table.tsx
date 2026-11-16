import { Card } from "@linea/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import type { ModelSetup, TaskModelKey } from "@/lib/model-settings-api"

import { TaskModelSelect } from "./task-model-select"

function tasks(setup: ModelSetup) {
  const analysisFallback =
    setup.settings.models.find(
      (model) => model.value === setup.settings.analysisFallbackModel
    )?.label ?? setup.settings.analysisFallbackModel
  return [
    { key: "defaultModel", label: "Assistant", unsetLabel: null },
    {
      key: "behaviourModel",
      label: "Conversation analysis",
      unsetLabel: `Automatic (${analysisFallback})`,
    },
    { key: "judgeModel", label: "Test grading", unsetLabel: "Automatic" },
    { key: "stepModel", label: "New AI steps", unsetLabel: "No preference" },
  ] satisfies { key: TaskModelKey; label: string; unsetLabel: string | null }[]
}

export function TaskModelsTable({
  slug,
  setup,
}: {
  slug: string
  setup: ModelSetup
}) {
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-normal text-muted-foreground">
              Task
            </TableHead>
            <TableHead className="text-right font-normal text-muted-foreground">
              Model
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks(setup).map((task) => (
            <TableRow key={task.key}>
              <TableCell className="font-medium">{task.label}</TableCell>
              <TableCell>
                <TaskModelSelect
                  slug={slug}
                  setup={setup}
                  task={task.key}
                  label={task.label}
                  unsetLabel={task.unsetLabel}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
