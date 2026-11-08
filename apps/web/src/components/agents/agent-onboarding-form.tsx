import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { Button, buttonVariants } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { createAgentFn } from "@/lib/agents-api"
import type { AgentSummary } from "@/lib/agent-schemas"
import {
  applicationsQueryOptions,
  createApplicationFn,
  type ApplicationSummary,
} from "@/lib/applications-api"
import { slugify } from "@/lib/auth-redirect"
import { AgentApplicationFields } from "./agent-application-fields"
import { AgentOnboardingAdvanced } from "./agent-onboarding-advanced"
import {
  agentOnboardingSchema,
  type AgentOnboardingInput,
} from "./agent-onboarding-schema"

export function AgentOnboardingForm({
  workspaceSlug,
  applications,
  initialApplicationId,
  plain = false,
}: Readonly<{
  workspaceSlug: string
  applications: ApplicationSummary[]
  initialApplicationId: string | undefined
  plain?: boolean
}>) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [advanced, setAdvanced] = useState(false)
  const [createdApplication, setCreatedApplication] =
    useState<ApplicationSummary | null>(null)
  const [createdAgent, setCreatedAgent] = useState<AgentSummary | null>(null)
  const form = useForm<AgentOnboardingInput>({
    resolver: zodResolver(agentOnboardingSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      application:
        applications.length === 0
          ? { kind: "new", name: "", slug: "" }
          : { kind: "existing", id: initialApplicationId ?? "" },
    },
  })
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    getFieldState,
    formState: { errors },
  } = form
  const create = useMutation({
    mutationFn: async (input: AgentOnboardingInput) => {
      let applicationId: string
      if (input.application.kind === "new") {
        const application = await createApplicationFn({
          data: { name: input.application.name, slug: input.application.slug },
        })
        setCreatedApplication(application)
        setValue("application", { kind: "existing", id: application.id })
        queryClient.setQueryData<ApplicationSummary[]>(
          applicationsQueryOptions(workspaceSlug).queryKey,
          (current) => [...(current ?? applications), application]
        )
        applicationId = application.id
      } else applicationId = input.application.id
      return createAgentFn({
        data: {
          applicationId,
          name: input.name,
          slug: input.slug,
          description: input.description,
        },
      })
    },
    onSuccess: async (agent) => {
      setCreatedAgent(agent)
      await queryClient.invalidateQueries({
        queryKey: ["agents", workspaceSlug, agent.applicationId],
      })
      await navigate({
        to: "/w/$slug/agents/$agentId",
        params: { slug: workspaceSlug, agentId: agent.id },
      })
    },
  })
  return (
    <FormProvider {...form}>
      <form
        className={
          plain
            ? "flex flex-col gap-4"
            : "overflow-hidden rounded-xl border bg-card"
        }
        onSubmit={(event) => {
          void handleSubmit(
            (input) => {
              const applicationInput = input.application
              if (
                applicationInput.kind === "new" &&
                applications.some(
                  (application) => application.slug === applicationInput.slug
                )
              ) {
                setError("application.slug", {
                  message:
                    "This identifier is already used. Choose the existing Application or change its identifier.",
                })
                setAdvanced(true)
                return
              }
              create.mutate(input)
            },
            () => setAdvanced(true)
          )(event)
        }}
      >
        <fieldset
          disabled={create.isPending || createdAgent !== null}
          className={plain ? "flex flex-col gap-4" : "flex flex-col gap-4 p-4"}
        >
          <Field>
            <FieldLabel htmlFor="agent-name">Agent name</FieldLabel>
            <Input
              id="agent-name"
              placeholder="Issue analyst"
              autoFocus
              {...register("name", {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  if (!getFieldState("slug").isDirty)
                    setValue(
                      "slug",
                      slugify(event.target.value).replace(/-$/, "")
                    )
                },
              })}
            />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <AgentApplicationFields applications={applications} />
          <AgentOnboardingAdvanced open={advanced} onOpenChange={setAdvanced} />
        </fieldset>
        {createdApplication && (
          <output className="block px-4 pb-4 text-xs text-muted-foreground">
            Application “{createdApplication.name}” was created. It is available
            in the Application selector.
          </output>
        )}
        {create.error && (
          <p role="alert" className="px-4 pb-4 text-xs text-destructive">
            {create.error.message} Your entries have been kept.
          </p>
        )}
        <div
          className={
            plain ? "flex justify-end" : "flex justify-end border-t px-4 py-3"
          }
        >
          {createdAgent ? (
            <Link
              to="/w/$slug/agents/$agentId"
              params={{ slug: workspaceSlug, agentId: createdAgent.id }}
              className={buttonVariants({ size: "sm" })}
            >
              Open Agent
              <ArrowRightIcon />
            </Link>
          ) : (
            <Button type="submit" size="xs" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Continue to configure"}
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  )
}
