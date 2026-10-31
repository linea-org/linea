import { useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
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
        <NativeSelect
          id="agent-application"
          className="w-full"
          value={application.kind === "new" ? "new" : application.id}
          onChange={(event) => {
            setValue(
              "application",
              event.target.value === "new"
                ? { kind: "new", name: "", slug: "" }
                : { kind: "existing", id: event.target.value }
            )
          }}
        >
          <NativeSelectOption value="">
            Choose an Application
          </NativeSelectOption>
          {applications.map((application) => (
            <NativeSelectOption key={application.id} value={application.id}>
              {application.name}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="new">
            Create an Application…
          </NativeSelectOption>
        </NativeSelect>
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
