import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { Button } from "@linea/ui/components/button"

export function WorkspaceLoadError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col items-start justify-center gap-3 p-6">
      <h1 className="font-heading text-xl font-semibold">
        Unable to load workspace
      </h1>
      <p className="text-sm text-muted-foreground">
        Try again to check your session and reload this page.
      </p>
      <Button
        onClick={() => {
          void router.invalidate()
          reset()
        }}
      >
        Try again
      </Button>
    </main>
  )
}
