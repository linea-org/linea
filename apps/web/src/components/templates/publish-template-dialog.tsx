import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Share2Icon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"
import { z } from "zod"

import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@linea/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { Textarea } from "@linea/ui/components/textarea"

import { publishTemplateFn, sharedTemplatesKey } from "@/lib/templates-api"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(300),
  visibility: z.enum(["workspace", "public"]),
})
type FormValues = z.infer<typeof schema>

const VISIBILITY_LABELS = {
  workspace: "This workspace",
  public: "Everyone on Linea",
} as const

function PublishedNotice({
  slug,
  name,
  onDone,
}: Readonly<{
  slug: string
  name: string
  onDone: () => void
}>) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base">Published “{name}”.</p>
      <DialogFooter>
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              to="/w/$slug/templates"
              params={{ slug }}
              search={{ tab: "workspace" }}
            />
          }
        >
          View templates
        </Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  )
}

/** Shares a copy of the workflow's saved graph as a template. */
export function PublishTemplateDialog({
  slug,
  workflowId,
  workflowName,
}: Readonly<{
  slug: string
  workflowId: string
  workflowName: string
}>) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: workflowName,
      description: "",
      visibility: "workspace",
    },
  })
  const publish = useMutation({
    mutationFn: (values: FormValues) =>
      publishTemplateFn({
        data: {
          workflowId,
          name: values.name,
          description: values.description || undefined,
          visibility: values.visibility,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sharedTemplatesKey(slug) }),
  })
  function close(next: boolean) {
    setOpen(next)
    if (!next) {
      reset({ name: workflowName, description: "", visibility: "workspace" })
      publish.reset()
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Share as a template"
                />
              }
            />
          }
        >
          <Share2Icon />
        </TooltipTrigger>
        <TooltipContent>Share as a template</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share as a template</DialogTitle>
        </DialogHeader>
        {publish.isSuccess ? (
          <PublishedNotice
            slug={slug}
            name={publish.data.name}
            onDone={() => close(false)}
          />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              void handleSubmit((values) => publish.mutate(values))(event)
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="template-name">Name</FieldLabel>
                <Input id="template-name" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="template-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="template-description"
                  rows={3}
                  {...register("description")}
                />
                <FieldError errors={[errors.description]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="template-visibility">
                  Who can see it
                </FieldLabel>
                <Controller
                  name="visibility"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="template-visibility">
                        <SelectValue>
                          {(value: keyof typeof VISIBILITY_LABELS) =>
                            VISIBILITY_LABELS[value]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(VISIBILITY_LABELS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {watch("visibility") === "public" ? (
                  <p className="text-sm text-muted-foreground">
                    Anyone on Linea will see this workflow’s prompts, URLs and
                    settings, and your workspace’s name.
                  </p>
                ) : null}
              </Field>
            </FieldGroup>
            {publish.isError ? (
              <p className="text-sm text-destructive">
                {publish.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={publish.isPending}>
                Publish
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
