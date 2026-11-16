import { FlaskConicalIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"

export function RunRegressionButton({
  published,
  pending,
  onRun,
}: Readonly<{ published: boolean; pending: boolean; onRun: () => void }>) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onRun}
      disabled={pending || !published}
      title={
        published
          ? undefined
          : "Publish a version before running the regression suite"
      }
    >
      <FlaskConicalIcon />
      {pending ? "Queuing…" : "Run now"}
    </Button>
  )
}
