import {
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
  ArrowUpIcon,
  BoxIcon,
  GlobeIcon,
  LayoutTemplateIcon,
  PaperclipIcon,
} from "lucide-react"
import { createPortal } from "react-dom"

import { Button } from "@linealabs/ui/components/button"
import { Kbd } from "@linealabs/ui/components/kbd"
import { cn } from "@linealabs/ui/lib/utils"

import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { ASSISTANT_NAME } from "@/lib/assistant-api"
import { pastedFile } from "@/lib/attachments"
import type { ComposerAction } from "./composer-actions"
import { ComposerFiles } from "./composer-files"
import { ComposerFrame } from "./composer-frame"
import { ComposerInput } from "./composer-input"
import { ModelMenu } from "./model-menu"
import { PlusMenu } from "./plus-menu"
import { sendOnEnter } from "./send-on-enter"
import { SlashMenu } from "./slash-menu"
import type { ComposerOptions } from "./use-composer-options"
import { useAttachFiles } from "./use-attach-files"
import { useFileDrop } from "./use-file-drop"
import { useSlashMenu } from "./use-slash-menu"

function DropOverlay() {
  return createPortal(
    <div className="pointer-events-none fixed inset-3 z-50 flex animate-in items-center justify-center rounded-2xl border border-dashed border-primary bg-background/90 text-sm font-medium text-primary duration-150 fade-in-0">
      Drop to add
    </div>,
    document.body
  )
}

export function AssistantComposer({
  value,
  onChange,
  onSend,
  placeholder,
  suggestion,
  options,
  hero,
  workflowId,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onSend: (text: string) => void
  placeholder: string
  /** A message Tab writes into the empty field; shown in place of the placeholder. */
  suggestion?: string
  options: ComposerOptions
  hero: boolean
  /** Set in a workflow chat, where Inky can only read that workflow's runs. */
  workflowId?: string
}>) {
  const { slug } = useParams({ strict: false })
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [modelOpen, setModelOpen] = useState(false)

  const { rejected, setRejected, attach } = useAttachFiles(
    options.attachments,
    options.onAttachmentsChange
  )
  const dropping = useFileDrop(attach)

  const actions: ComposerAction[] = [
    {
      id: "files",
      label: "Add files",
      Icon: PaperclipIcon,
      run: () => fileInput.current?.click(),
    },
    {
      id: "web",
      label: "Browse the web",
      checked: options.web,
      Icon: GlobeIcon,
      run: () => options.onWebChange(!options.web),
    },
    {
      id: "model",
      label: "Model",
      detail: options.model?.label,
      Icon: BoxIcon,
      run: () => setModelOpen(true),
    },
  ]
  if (slug && workflowId === undefined) {
    actions.push({
      id: "templates",
      label: "Use a template",
      Icon: LayoutTemplateIcon,
      run: () =>
        void navigate({
          to: "/w/$slug/templates",
          params: { slug },
          search: {},
        }),
    })
  }
  const slash = useSlashMenu(value, onChange, actions)

  const canSend = value.trim().length > 0
  function submit() {
    if (!canSend) return
    if (options.model === null) {
      setModelOpen(true)
      return
    }
    onSend(value.trim())
    onChange("")
    setRejected([])
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (slash.handleKeyDown(event)) return
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      suggestion !== undefined &&
      value === ""
    ) {
      event.preventDefault()
      onChange(suggestion)
      return
    }
    sendOnEnter(event, submit)
  }
  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const pasted = pastedFile(event.clipboardData.getData("text/plain"))
    const files = pasted ? [pasted] : [...event.clipboardData.files]
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    attach(files)
  }

  return (
    <div
      data-shortcut-scope="composer"
      data-hero={hero || undefined}
      className={cn("group/composer", !hero && "p-3 pt-0")}
      onPasteCapture={onPaste}
    >
      {dropping ? <DropOverlay /> : null}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          attach([...(event.target.files ?? [])])
          event.target.value = ""
        }}
      />
      <ComposerFrame
        value={value}
        menu={
          slash.active ? (
            <SlashMenu
              items={slash.items}
              active={slash.active}
              onActiveChange={slash.setActiveId}
              onPick={slash.pick}
            />
          ) : null
        }
        above={
          options.attachments.length + rejected.length > 0 ? (
            <ComposerFiles
              files={options.attachments}
              onFilesChange={options.onAttachmentsChange}
              rejected={rejected}
              onRejectedChange={setRejected}
            />
          ) : null
        }
        leading={
          <>
            <PlusMenu actions={actions} />
            {options.web ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Stop browsing the web"
                className="rounded-full text-primary"
                onClick={() => options.onWebChange(false)}
              >
                <GlobeIcon />
              </Button>
            ) : null}
          </>
        }
        trailing={
          <>
            {suggestion !== undefined && value === "" ? <Kbd>Tab</Kbd> : null}
            <ModelMenu
              options={options}
              open={modelOpen}
              onOpenChange={setModelOpen}
            />
            <Button
              type="button"
              size="icon"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="rounded-full"
              {...shortcutTarget("send")}
            >
              <ArrowUpIcon />
            </Button>
          </>
        }
      >
        <ComposerInput
          label={`Message ${ASSISTANT_NAME}`}
          value={value}
          onChange={onChange}
          onSendKey={onKeyDown}
          placeholder={suggestion ?? placeholder}
          autoFocus={hero}
          workflowId={workflowId}
        />
      </ComposerFrame>
    </div>
  )
}
