import { useMutation, useQueryClient } from "@tanstack/react-query"
import { StarIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import { cn } from "@linealabs/ui/lib/utils"

import {
  setTemplateStarFn,
  sharedTemplatesKey,
  type SharedTemplate,
} from "@/lib/templates-api"

export function TemplateStarButton({
  slug,
  template,
}: Readonly<{
  slug: string
  template: SharedTemplate
}>) {
  const queryClient = useQueryClient()
  const star = useMutation({
    mutationFn: () =>
      setTemplateStarFn({
        data: { id: template.id, starred: !template.starred },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sharedTemplatesKey(slug) }),
  })
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={template.starred}
      aria-label={template.starred ? "Remove star" : "Star"}
      disabled={star.isPending}
      onClick={() => star.mutate()}
    >
      <StarIcon className={cn(template.starred && "fill-current")} />
      {template.starCount}
    </Button>
  )
}
