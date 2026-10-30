import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linea/ui/components/alert-dialog"
import type { AgentVersion } from "@/lib/agent-schemas"

export function AgentVersionReplacement({
  version,
  onCancel,
  onConfirm,
}: {
  version: AgentVersion | null
  onCancel: () => void
  onConfirm: (version: AgentVersion) => void
}) {
  return (
    <AlertDialog
      open={version !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Load version {version?.version} into the definition editor. This
            replaces your unsaved changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (version) onConfirm(version)
            }}
          >
            Replace changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
