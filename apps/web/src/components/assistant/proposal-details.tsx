import { PlayIcon, PlusIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Spinner } from "@linea/ui/components/spinner"

import type { Proposal } from "./proposal"
import { ProposalRunResult } from "./proposal-run-result"
import { ProposalSidebar } from "./proposal-sidebar"
import { useCreateFromProposal } from "./use-create-from-proposal"
import { useProposalRun } from "./use-proposal-run"

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
  const { start, run, executionId } = useProposalRun()
  return (
    <ProposalSidebar
      proposal={proposal}
      onClose={onClose}
      actions={
        <>
          {executionId ? (
            <ProposalRunResult
              slug={slug}
              executionId={executionId}
              detail={run.data}
            />
          ) : null}
          {start.isError ? (
            <p className="text-sm text-destructive">{start.error.message}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={start.isPending}
            onClick={() => start.mutate(proposal)}
          >
            {start.isPending ? <Spinner /> : <PlayIcon />}
            Run
          </Button>
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate(proposal)}
          >
            {create.isPending ? <Spinner /> : <PlusIcon />}
            Create workflow
          </Button>
          {create.isError ? (
            <p className="text-sm text-destructive">{create.error.message}</p>
          ) : null}
        </>
      }
    />
  )
}
