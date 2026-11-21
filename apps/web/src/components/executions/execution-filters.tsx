import { Field, FieldLabel } from "@linealabs/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"

import { FilterPopover } from "@/components/workspace/filter-popover"
import {
  EXECUTION_STATUSES,
  executionStatusDefinition,
  isExecutionStatus,
} from "@/lib/execution-status"
import {
  EXECUTION_TRIGGERS,
  isExecutionTrigger,
  triggerLabel,
} from "@/lib/execution-trigger"
import type { ExecutionStatus, ExecutionTrigger } from "@/lib/executions-api"

type ExecutionFilterValues = {
  status: ExecutionStatus | undefined
  trigger: ExecutionTrigger | undefined
}

export function ExecutionFilters({
  values,
  onChange,
}: Readonly<{
  values: ExecutionFilterValues
  onChange: (values: ExecutionFilterValues) => void
}>) {
  return (
    <FilterPopover
      label="Filter executions"
      active={values.status !== undefined || values.trigger !== undefined}
      onReset={() => onChange({ status: undefined, trigger: undefined })}
    >
      <Field orientation="horizontal">
        <FieldLabel>Status</FieldLabel>
        <Select
          value={values.status ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...values,
              status: isExecutionStatus(value) ? value : undefined,
            })
          }
        >
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue>
              {(value: string) =>
                isExecutionStatus(value)
                  ? executionStatusDefinition[value].label
                  : "All statuses"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EXECUTION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {executionStatusDefinition[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal">
        <FieldLabel>Trigger</FieldLabel>
        <Select
          value={values.trigger ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...values,
              trigger: isExecutionTrigger(value) ? value : undefined,
            })
          }
        >
          <SelectTrigger aria-label="Filter by trigger" className="w-40">
            <SelectValue>
              {(value: string) =>
                isExecutionTrigger(value) ? triggerLabel[value] : "All triggers"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All triggers</SelectItem>
            {EXECUTION_TRIGGERS.map((trigger) => (
              <SelectItem key={trigger} value={trigger}>
                {triggerLabel[trigger]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FilterPopover>
  )
}
