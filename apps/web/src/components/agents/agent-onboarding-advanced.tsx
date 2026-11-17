import { useFormContext } from "react-hook-form"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@linealabs/ui/components/accordion"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@linealabs/ui/components/field"
import { Input } from "@linealabs/ui/components/input"
import { Textarea } from "@linealabs/ui/components/textarea"
import type { AgentOnboardingInput } from "./agent-onboarding-schema"

export function AgentOnboardingAdvanced({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const {
    register,
    watch,
    getFieldState,
    formState: { errors },
  } = useFormContext<AgentOnboardingInput>()
  return (
    <Accordion
      value={open ? ["advanced"] : []}
      onValueChange={(value) => onOpenChange(value.length > 0)}
    >
      <AccordionItem value="advanced">
        <AccordionTrigger className="py-1">Advanced settings</AccordionTrigger>
        <AccordionContent keepMounted className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="agent-identifier">Agent identifier</FieldLabel>
            <Input id="agent-identifier" {...register("slug")} />
            <FieldDescription>Generated from the name.</FieldDescription>
            <FieldError>{errors.slug?.message}</FieldError>
          </Field>
          {watch("application.kind") === "new" && (
            <Field>
              <FieldLabel htmlFor="agent-application-identifier">
                Application identifier
              </FieldLabel>
              <Input
                id="agent-application-identifier"
                {...register("application.slug")}
              />
              <FieldError>
                {getFieldState("application.slug").error?.message}
              </FieldError>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="agent-description">Description</FieldLabel>
            <Textarea
              id="agent-description"
              rows={3}
              {...register("description")}
            />
            <FieldError>{errors.description?.message}</FieldError>
          </Field>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
