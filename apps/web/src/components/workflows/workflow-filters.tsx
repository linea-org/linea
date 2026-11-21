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
  WORKFLOW_STATUS_FILTERS,
  isWorkflowStatusFilter,
  type WorkflowStatusFilter,
} from "@/lib/workflow-status-filter"

type WorkflowFilterValues = {
  applicationId: string | undefined
  status: WorkflowStatusFilter | undefined
}

export function WorkflowFilters({
  applications,
  values,
  onChange,
}: Readonly<{
  applications: { id: string; name: string }[]
  values: WorkflowFilterValues
  onChange: (values: WorkflowFilterValues) => void
}>) {
  return (
    <FilterPopover
      label="Filter workflows"
      active={values.applicationId !== undefined || values.status !== undefined}
      onReset={() => onChange({ applicationId: undefined, status: undefined })}
    >
      <Field orientation="horizontal">
        <FieldLabel>Application</FieldLabel>
        <Select
          value={values.applicationId ?? "all"}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            onChange({
              ...values,
              applicationId: value === "all" ? undefined : value,
            })
          }}
        >
          <SelectTrigger aria-label="Filter by Application" className="w-40">
            <SelectValue>
              {(value: string) =>
                applications.find((application) => application.id === value)
                  ?.name ?? "All Applications"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Applications</SelectItem>
            {applications.map((application) => (
              <SelectItem key={application.id} value={application.id}>
                {application.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal">
        <FieldLabel>Status</FieldLabel>
        <Select
          value={values.status ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...values,
              status: isWorkflowStatusFilter(value) ? value : undefined,
            })
          }
        >
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue>
              {(value: string) => (value === "all" ? "All statuses" : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WORKFLOW_STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter} value={filter}>
                {filter}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FilterPopover>
  )
}
