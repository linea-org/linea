import { PlusIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Spinner } from "@linea/ui/components/spinner"

import type { Proposal } from "./proposal"
import { ProposalSidebar } from "./proposal-sidebar"
import { useCreateFromProposal } from "./use-create-from-proposal"

export function ProposalDetails({
  slug,
  proposal,
  onClose,
}: {
  slug: string
  proposal: Proposal
  onClose: () => void
}) {
  const create = useCreateFromProposal(slug)
  return (
    <ProposalSidebar
      proposal={proposal}
      onClose={onClose}
      actions={
        <>
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate(proposal)}
          >
            {create.isPending ? <Spinner /> : <PlusIcon />}
            Create workflow
          </Button>
          {create.isError ? (
            <p className="text-xs text-destructive">{create.error.message}</p>
          ) : null}
        </>
      }
    />
  )
}
