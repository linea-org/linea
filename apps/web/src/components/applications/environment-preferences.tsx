import { useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@linealabs/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linealabs/ui/components/field"
import { Input } from "@linealabs/ui/components/input"
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
} from "@linealabs/ui/components/alert-dialog"
import {
  disableEnvironmentFn,
  updateEnvironmentRetentionFn,
  type EnvironmentSummary,
} from "@/lib/environments-api"

export function EnvironmentPreferences({
  environment,
  onSaved,
}: Readonly<{
  environment: EnvironmentSummary
  onSaved: () => Promise<void>
}>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ contentRetentionDays: number }>({
    defaultValues: { contentRetentionDays: environment.contentRetentionDays },
  })
  const retention = useMutation({
    mutationFn: (data: { contentRetentionDays: number }) =>
      updateEnvironmentRetentionFn({
        data: { ...data, environmentId: environment.id },
      }),
    onSuccess: onSaved,
  })
  const disable = useMutation({
    mutationFn: () =>
      disableEnvironmentFn({ data: { environmentId: environment.id } }),
    onSuccess: onSaved,
  })
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => retention.mutate(data))(event)
        }}
        className="flex items-end gap-2"
      >
        <Field className="flex-1">
          <FieldLabel htmlFor={`${environment.id}-retention`}>
            Content retention in days
          </FieldLabel>
          <Input
            id={`${environment.id}-retention`}
            type="number"
            {...register("contentRetentionDays", {
              valueAsNumber: true,
              min: 1,
              max: 3650,
              required: true,
            })}
          />
          <FieldError>
            {errors.contentRetentionDays && "Enter between 1 and 3650 days."}
          </FieldError>
        </Field>
        <Button type="submit" disabled={retention.isPending}>
          Save retention
        </Button>
      </form>
      {retention.isSuccess && (
        <output className="block text-sm text-muted-foreground">
          Retention saved.
        </output>
      )}
      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Disable Environment</h3>
          <p className="text-sm text-muted-foreground">
            Disabling this Environment revokes its active user sessions.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="destructive"
                disabled={!environment.enabled || disable.isPending}
              />
            }
          >
            Disable Environment
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disable this Environment?</AlertDialogTitle>
              <AlertDialogDescription>
                Active sessions will be signed out.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => disable.mutate()}>
                Disable Environment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {(retention.error || disable.error) && (
        <p role="alert" className="text-sm text-destructive">
          {retention.error?.message ?? disable.error?.message}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Environment ID: <code className="break-all">{environment.id}</code>
      </p>
    </div>
  )
}
