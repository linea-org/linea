import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@linea/ui/components/input-group"

import { CopyButton } from "@/components/copy-button"
import { apiKeysQueryOptions, createApiKeyFn } from "@/lib/api-keys-api"
import type { AccessPreset } from "./api-key-access"
import { CreateApiKeyForm } from "./create-api-key-form"

export function CreateApiKeyDialog({
  slug,
  open,
  onOpenChange,
  defaultAccess = "read",
}: Readonly<{
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAccess?: Exclude<AccessPreset, "custom">
}>) {
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: createApiKeyFn,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: apiKeysQueryOptions(slug).queryKey,
      }),
  })
  const rawKey = create.data?.rawKey
  // Dropping the mutation result is what clears the one-time key from memory.
  function close() {
    create.reset()
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-request would create a key whose one-time value is never shown.
        if (next) onOpenChange(true)
        else if (!create.isPending) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {rawKey ? "Copy your API key" : "Create API key"}
          </DialogTitle>
        </DialogHeader>
        {rawKey ? (
          <>
            <p className="text-sm text-muted-foreground">
              It won’t be shown again.
            </p>
            <InputGroup>
              <InputGroupInput
                readOnly
                aria-label="API key"
                value={rawKey}
                className="font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <InputGroupAddon align="inline-end">
                <CopyButton text={rawKey} label="API key" size="icon-xs" />
              </InputGroupAddon>
            </InputGroup>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <CreateApiKeyForm
              key={String(open)}
              defaultAccess={defaultAccess}
              pending={create.isPending}
              onSubmit={(values) => create.mutate({ data: values })}
            />
            {create.isError ? (
              <p className="text-sm text-destructive">{create.error.message}</p>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
