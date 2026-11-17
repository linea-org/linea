import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { isPersonalWorkspace } from "@linealabs/auth/personal-workspace"
import {
  EllipsisIcon,
  LogOutIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linealabs/ui/components/alert-dialog"
import { Button } from "@linealabs/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"

import { deleteOrganization, leaveOrganization } from "@/lib/auth-queries"
import type { WorkspaceWithRole } from "@/lib/auth-session"

type Confirming = "delete" | "leave" | null

export function WorkspaceRowActions({
  workspace,
  onRemoved,
}: Readonly<{
  workspace: WorkspaceWithRole
  onRemoved: (workspaceId: string) => void
}>) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<Confirming>(null)
  const personal = isPersonalWorkspace(workspace.metadata)
  const owner = workspace.role.split(",").includes("owner")
  const remove = useMutation({
    mutationFn: () =>
      confirming === "delete"
        ? deleteOrganization(workspace.id)
        : leaveOrganization(workspace.id),
    onSuccess: () => {
      setConfirming(null)
      onRemoved(workspace.id)
    },
  })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${workspace.name} options`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            onClick={() =>
              void navigate({
                to: "/w/$slug/settings",
                params: { slug: workspace.slug },
              })
            }
          >
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          {personal || owner ? null : (
            <DropdownMenuItem onClick={() => setConfirming("leave")}>
              <LogOutIcon />
              Leave workspace
            </DropdownMenuItem>
          )}
          {personal || !owner ? null : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirming("delete")}
            >
              <Trash2Icon />
              Delete workspace
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null)
            remove.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "delete" ? "Delete" : "Leave"} {workspace.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "delete"
                ? "Deletes all workflows and run history. This can't be undone."
                : "You will lose access until someone invites you again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p className="text-sm text-destructive">{remove.error.message}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                remove.mutate()
              }}
              disabled={remove.isPending}
            >
              {confirming === "delete" ? "Delete" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
