import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/w/$slug/settings/secrets")({
  component: SecretsPage,
})

function SecretsPage() {
  const { slug } = Route.useParams()
  return (
    <section className="p-6">
      <h1 className="text-lg font-semibold">Environment secrets</h1>
      <p className="my-3 text-sm text-muted-foreground">
        Manage provider keys and other secrets inside each Application’s
        Development or Production Environment.
      </p>
      <Link
        to="/w/$slug/applications"
        params={{ slug }}
        className="text-sm underline"
      >
        Open Applications
      </Link>
    </section>
  )
}
