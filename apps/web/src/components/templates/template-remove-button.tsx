import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@linea/ui/components/alert-dialog"
import { Button } from "@linea/ui/components/button"

import {
  deleteTemplateFn,
  sharedTemplatesKey,
  type SharedTemplate,
} from "@/lib/templates-api"

export function TemplateRemoveButton({
  slug,
  template,
}: {
  slug: string
  template: SharedTemplate
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteTemplateFn({ data: { id: template.id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sharedTemplatesKey(slug) }),
  })
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${template.name}`}
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{template.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears for everyone who could see it. Workflows already built
            from it are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => remove.mutate()}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
