import { useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { slugify } from "@/lib/auth-redirect"
import type { ApplicationSummary } from "@/lib/applications-api"
import type { AgentOnboardingInput } from "./agent-onboarding-schema"

export function AgentApplicationFields({
  applications,
}: {
  applications: ApplicationSummary[]
}) {
  const { register, watch, setValue, getFieldState } =
    useFormContext<AgentOnboardingInput>()
  const application = watch("application")
  return (
    <>
      <Field>
        <FieldLabel htmlFor="agent-application">Application</FieldLabel>
        <Select
          value={application.kind === "new" ? "new" : application.id || null}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            setValue(
              "application",
              value === "new"
                ? { kind: "new", name: "", slug: "" }
                : { kind: "existing", id: value }
            )
          }}
        >
          <SelectTrigger id="agent-application" className="w-full">
            <SelectValue placeholder="Choose an Application">
              {(value: string) =>
                value === "new"
                  ? "Create an Application…"
                  : (applications.find((item) => item.id === value)?.name ??
                    "Choose an Application")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {applications.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
            <SelectItem value="new">Create an Application…</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>The product this Agent belongs to.</FieldDescription>
        <FieldError>
          {getFieldState("application.id").error?.message}
        </FieldError>
      </Field>
      {application.kind === "new" && (
        <Field>
          <FieldLabel htmlFor="agent-application-name">
            Application name
          </FieldLabel>
          <Input
            id="agent-application-name"
            placeholder="GitHub Assistant"
            {...register("application.name", {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                if (!getFieldState("application.slug").isDirty)
                  setValue(
                    "application.slug",
                    slugify(event.target.value).replace(/-+$/, "")
                  )
              },
            })}
          />
          <FieldDescription>
            Development and Production Environments are created with it.
          </FieldDescription>
          <FieldError>
            {getFieldState("application.name").error?.message}
          </FieldError>
        </Field>
      )}
    </>
  )
}
