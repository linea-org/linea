import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import {
  applicationsQueryOptions,
  createApplicationFn,
  listApplicationsFn,
} from "@/lib/applications-api"

export const Route = createFileRoute("/w/$slug/applications/")({
  loader: () => listApplicationsFn(),
  component: ApplicationsPage,
})

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
})

function ApplicationsPage() {
  const { slug } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: Route.useLoaderData(),
  })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "" },
  })
  const create = useMutation({
    mutationFn: (data: z.infer<typeof schema>) => createApplicationFn({ data }),
    onSuccess: async () => {
      reset()
      await queryClient.invalidateQueries(applicationsQueryOptions(slug))
    },
  })
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Your products own their Workflows. Each has separate Development and
          Production Environments.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => create.mutate(data))(event)
        }}
        className="flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4"
      >
        <h2 className="font-medium">Create an Application</h2>
        <Field>
          <FieldLabel htmlFor="application-name">Name</FieldLabel>
          <Input id="application-name" {...register("name")} />
          <FieldError>{errors.name?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="application-slug">Slug</FieldLabel>
          <Input
            id="application-slug"
            placeholder="support-assistant"
            {...register("slug")}
          />
          <FieldError>{errors.slug?.message}</FieldError>
        </Field>
        {create.error && (
          <p className="text-sm text-destructive">{create.error.message}</p>
        )}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create Application"}
        </Button>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        {applications.map((application) => (
          <Link
            key={application.id}
            to="/w/$slug/applications/$applicationId"
            params={{ slug, applicationId: application.id }}
            className="rounded-xl border bg-card p-4 hover:bg-accent"
          >
            <h2 className="font-medium">{application.name}</h2>
            <p className="text-sm text-muted-foreground">
              {application.slug} · Development and Production
            </p>
          </Link>
        ))}
      </div>
    </main>
  )
}
