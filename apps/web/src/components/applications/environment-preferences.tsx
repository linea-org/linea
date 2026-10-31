import { useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
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
import {
  disableEnvironmentFn,
  updateEnvironmentRetentionFn,
  type EnvironmentSummary,
} from "@/lib/environments-api"

export function EnvironmentPreferences({
  environment,
  onSaved,
}: {
  environment: EnvironmentSummary
  onSaved: () => Promise<void>
}) {
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
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => retention.mutate(data))(event)
        }}
        className="flex flex-col gap-3"
      >
        <Field>
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
        <Button
          type="submit"
          size="sm"
          className="self-start"
          disabled={retention.isPending}
        >
          Save retention
        </Button>
        {retention.isSuccess && (
          <p role="status" className="text-xs text-muted-foreground">
            Retention saved.
          </p>
        )}
      </form>
      <div className="flex flex-col gap-3 border-t pt-4">
        <h3 className="text-sm font-medium">Disable Environment</h3>
        <p className="text-xs text-muted-foreground">
          Disabling this Environment revokes its active user sessions.
        </p>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="destructive"
                size="sm"
                className="self-start"
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
                Active user sessions will be revoked. Other Environments are not
                affected.
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
        <p role="alert" className="text-xs text-destructive">
          {retention.error?.message ?? disable.error?.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Environment ID: <code className="break-all">{environment.id}</code>
      </p>
    </div>
  )
}
