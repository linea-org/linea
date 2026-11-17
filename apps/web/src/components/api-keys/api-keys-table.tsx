import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

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
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import {
  apiKeysQueryOptions,
  revokeApiKeyFn,
  type ApiKey,
} from "@/lib/api-keys-api"
import { formatDate } from "@/lib/format"
import { accessLabel } from "./api-key-access"

const headClass = "px-4 font-normal text-muted-foreground"

export function ApiKeysTable({
  slug,
  keys,
}: Readonly<{ slug: string; keys: ApiKey[] }>) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<ApiKey | null>(null)
  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKeyFn({ data: { id } }),
    onSuccess: async () => {
      setTarget(null)
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryOptions(slug).queryKey,
      })
    },
  })
  const now = Date.now()
  return (
    <>
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className={headClass}>Name</TableHead>
              <TableHead className={headClass}>Access</TableHead>
              <TableHead className={headClass}>Last used</TableHead>
              <TableHead className={headClass}>Expires</TableHead>
              <TableHead className="w-24 px-2">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => {
              const expired = new Date(key.expiresAt).getTime() <= now
              return (
                <TableRow key={key.id}>
                  <TableCell className="px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {key.name}
                      </span>
                      <code className="text-sm text-muted-foreground">
                        {key.keyPrefix}…
                      </code>
                      {expired ? (
                        <Badge variant="secondary">Expired</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground">
                    {accessLabel(key.scopes)}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {formatDate(key.expiresAt)}
                  </TableCell>
                  <TableCell className="px-2 text-right">
                    <Button variant="ghost" onClick={() => setTarget(key)}>
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          // A pending revoke clears the target on success, which would close a newer confirmation.
          if (!open && !revoke.isPending) {
            setTarget(null)
            revoke.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests using this key stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revoke.isError ? (
            <p className="text-sm text-destructive">{revoke.error.message}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => {
                if (target) revoke.mutate(target.id)
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
