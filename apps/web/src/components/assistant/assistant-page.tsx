import { useCallback, useEffect, useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"

import { ScrollArea } from "@linea/ui/components/scroll-area"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@linea/ui/components/resizable"
import { Sheet, SheetContent, SheetTitle } from "@linea/ui/components/sheet"

import {
  isModelReady,
  modelSetupQueryOptions,
  type ModelSetup,
} from "@/lib/model-settings-api"
import { AssistantComposer } from "./assistant-composer"
import { AssistantThread } from "./assistant-thread"
import type { Proposal } from "./proposal"
import { ProposalDetails } from "./proposal-details"
import { useComposerOptions } from "./use-composer-options"
import { usePageChat } from "./use-page-chat"
import { useWideLayout } from "./use-wide-layout"
import { AssistantHero } from "./assistant-hero"

export function AssistantPage({
  slug,
  initialSetup,
  conversationId,
}: Readonly<{
  slug: string
  initialSetup: ModelSetup
  // The saved chat named in the address, if any.
  conversationId: string | undefined
}>) {
  const wide = useWideLayout()
  const { data: setup } = useSuspenseQuery({
    ...modelSetupQueryOptions(slug),
    initialData: initialSetup,
  })
  const [draft, setDraft] = useState("")
  const [detailsOpen, setDetailsOpen] = useState(true)
  // The prompt card glides down from the middle only when a chat starts here, not when one is opened.
  const [composerGlides, setComposerGlides] = useState(false)
  const options = useComposerOptions(setup)
  const resetDraft = useCallback(() => {
    setComposerGlides(false)
    setDraft("")
  }, [])
  const { chat, title } = usePageChat({
    slug,
    conversationId,
    options,
    onReset: resetDraft,
  })
  function sendWithFiles(text: string) {
    if (inHero) setComposerGlides(true)
    chat.send(text, options.attachments)
    options.onAttachmentsChange([])
  }
  const detail = detailsOpen ? chat.selectedProposal : null
  // Kept while the panel slides shut, so it does not empty out first.
  const [lastDetail, setLastDetail] = useState<Proposal | null>(null)
  useEffect(() => {
    if (detail) setLastDetail(detail)
  }, [detail])
  const shown = detail ?? lastDetail
  const sidebar = shown ? (
    <ProposalDetails
      slug={slug}
      proposal={shown}
      onClose={() => setDetailsOpen(false)}
    />
  ) : null
  const inHero = chat.messages.length === 0 && !chat.isPending
  return (
    <div className="absolute inset-0 flex">
      <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
        <ResizablePanel id="chat" minSize="360px">
          <section className="flex h-full min-w-0 flex-col">
            {inHero ? null : (
              <div className="flex h-12 shrink-0 items-center px-4">
                <p className="min-w-0 flex-1 truncate text-base font-medium">
                  {title}
                </p>
              </div>
            )}
            {inHero ? (
              <ScrollArea className="min-h-0 flex-1">
                <AssistantHero
                  slug={slug}
                  setup={setup}
                  ready={isModelReady(setup)}
                  options={options}
                  draft={draft}
                  onDraftChange={setDraft}
                  onSend={sendWithFiles}
                  disabled={chat.isPending}
                />
              </ScrollArea>
            ) : (
              <>
                <AssistantThread
                  messages={chat.messages}
                  isPending={chat.isPending}
                  error={chat.error}
                  selectedProposalId={detail?.id ?? null}
                  onEdit={(id, text) => chat.edit(id, text)}
                  retry={{
                    models: options.models.filter((model) =>
                      options.keyed.has(model.keyName)
                    ),
                    current: options.model?.value,
                    onRetry: (id, model) => chat.retry(id, model),
                  }}
                  onSwitch={chat.switchTo}
                  onSelectProposal={(id) => {
                    chat.select(id)
                    setDetailsOpen(true)
                  }}
                  empty={{
                    title: "",
                    suggestions: [],
                    onSuggest: () => undefined,
                  }}
                />
                <div
                  className={
                    composerGlides
                      ? "animate-in duration-500 ease-out fade-in-0 slide-in-from-top-32"
                      : undefined
                  }
                >
                  <AssistantComposer
                    hero={false}
                    value={draft}
                    onChange={setDraft}
                    onSend={sendWithFiles}
                    disabled={chat.isPending}
                    options={options}
                    placeholder="Ask a follow-up, or ask for a change"
                  />
                </div>
              </>
            )}
          </section>
        </ResizablePanel>
        {wide && detail ? (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="details"
              defaultSize="400px"
              minSize="320px"
              maxSize="70%"
            >
              <div
                key={shown?.id}
                className="h-full animate-in duration-300 fade-in-0 slide-in-from-right-8"
              >
                {sidebar}
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      {wide ? null : (
        <Sheet
          open={detail !== null}
          onOpenChange={(next) => {
            if (!next) setDetailsOpen(false)
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-full max-w-none gap-0 p-0 sm:max-w-md"
          >
            <SheetTitle className="sr-only">Proposed workflow</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
