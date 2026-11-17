import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { z } from "zod"

import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@linealabs/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linealabs/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@linealabs/ui/components/radio-group"
import { Textarea } from "@linealabs/ui/components/textarea"

import {
  appealTemplateFn,
  appealTypesQueryOptions,
  sharedTemplatesKey,
  type AppealType,
  type SharedTemplate,
} from "@/lib/templates-api"

const schema = z.object({
  type: z.string().min(1, "Choose what fits best"),
  message: z.string().trim().max(1000),
})
type FormValues = z.infer<typeof schema>

function AppealForm({
  slug,
  template,
  types,
  onDone,
}: Readonly<{
  slug: string
  template: SharedTemplate
  types: AppealType[]
  onDone: () => void
}>) {
  const queryClient = useQueryClient()
  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "", message: "" },
  })
  const chosen = types.find((type) => type.id === watch("type"))
  const send = useMutation({
    mutationFn: (values: FormValues) =>
      appealTemplateFn({
        data: {
          id: template.id,
          type: values.type,
          message: values.message || undefined,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: sharedTemplatesKey(slug),
      })
      onDone()
    },
  })
  function submit(values: FormValues) {
    if (
      types.find((type) => type.id === values.type)?.messageRequired &&
      !values.message
    ) {
      setError("message", { message: "Add a few words for the reviewer" })
      return
    }
    send.mutate(values)
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void handleSubmit(submit)(event)
      }}
    >
      <FieldGroup>
        <Field>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {types.map((type) => (
                  <label
                    key={type.id}
                    className="flex cursor-pointer items-start gap-2 text-base"
                  >
                    <RadioGroupItem value={type.id} className="mt-0.5" />
                    <span>{type.label}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
          <FieldError errors={[errors.type]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="appeal-message">
            {chosen?.hint ?? "Message"}
          </FieldLabel>
          <Textarea id="appeal-message" rows={4} {...register("message")} />
          <FieldError errors={[errors.message]} />
        </Field>
      </FieldGroup>
      {send.isError ? (
        <p className="text-sm text-destructive">{send.error.message}</p>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={send.isPending}>
          Send appeal
        </Button>
      </DialogFooter>
    </form>
  )
}

/** An author asks staff to look again at a hidden template. */
export function AppealTemplateDialog({
  slug,
  template,
}: Readonly<{
  slug: string
  template: SharedTemplate
}>) {
  const [open, setOpen] = useState(false)
  const { data: types } = useSuspenseQuery(appealTypesQueryOptions)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        Appeal
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appeal “{template.name}”</DialogTitle>
        </DialogHeader>
        <AppealForm
          slug={slug}
          template={template}
          types={types}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
