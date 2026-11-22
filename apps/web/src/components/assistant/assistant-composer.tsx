import { useRef, useState, type KeyboardEvent } from "react"
import { Link, useParams } from "@tanstack/react-router"
import {
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  GlobeIcon,
  PaperclipIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@linealabs/ui/components/badge"
import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
} from "@linealabs/ui/components/input-group"
import { cn } from "@linealabs/ui/lib/utils"

import { ModelSetupForm } from "@/components/models/model-setup-form"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { ASSISTANT_NAME } from "@/lib/assistant-api"
import { readAttachments } from "@/lib/attachments"
import type { CatalogModel } from "@/lib/model-settings-api"
import { ComposerInput } from "./composer-input"
import type { ComposerOptions } from "./use-composer-options"

function ToolsMenu({ options }: Readonly<{ options: ComposerOptions }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={options.model === null}
            aria-label="Tools"
          />
        }
      >
        {options.web ? <GlobeIcon className="text-primary" /> : <WrenchIcon />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuCheckboxItem
          checked={options.web}
          onCheckedChange={options.onWebChange}
        >
          <GlobeIcon />
          Browse the web
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ModelMenu({
  options,
  open,
  onOpenChange,
}: Readonly<{
  options: ComposerOptions
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const { slug } = useParams({ strict: false })
  const [needsKey, setNeedsKey] = useState<CatalogModel | null>(null)
  const providers = [
    ...new Map(
      options.models.map((model) => [model.providerId, model.providerLabel])
    ),
  ]
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={options.models.length === 0}
              aria-label="Model"
              className={cn(
                "min-w-0 justify-start",
                options.model === null && "text-primary ring-1 ring-primary/50"
              )}
            />
          }
        >
          <span className="truncate">
            {options.model?.label ?? "Choose a model"}
          </span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuRadioGroup
            value={options.model?.value ?? ""}
            onValueChange={(value) => {
              if (typeof value !== "string") return
              const model = options.models.find((item) => item.value === value)
              onOpenChange(false)
              if (model && !options.keyed.has(model.keyName)) setNeedsKey(model)
              else options.onModelChange(value)
            }}
          >
            {providers.map(([providerId, providerLabel]) => {
              const providerModels = options.models.filter(
                (model) => model.providerId === providerId
              )
              const hasKey = options.keyed.has(providerModels[0].keyName)
              return (
                <DropdownMenuGroup key={providerId}>
                  <DropdownMenuLabel>
                    {providerLabel}
                    {hasKey ? "" : " · add key"}
                  </DropdownMenuLabel>
                  {providerModels.map((model) => (
                    <DropdownMenuRadioItem
                      key={model.value}
                      value={model.value}
                    >
                      {model.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              )
            })}
          </DropdownMenuRadioGroup>
          {slug ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link to="/w/$slug/settings/models" params={{ slug }} />
                }
              >
                Manage keys
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {slug && options.setup && needsKey ? (
        <Dialog open onOpenChange={() => setNeedsKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add your {needsKey.providerLabel} key</DialogTitle>
            </DialogHeader>
            <ModelSetupForm
              slug={slug}
              setup={{
                ...options.setup,
                settings: {
                  ...options.setup.settings,
                  defaultModel: needsKey.value,
                },
              }}
              onSaved={(values) => {
                options.onModelChange(values.model)
                setNeedsKey(null)
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

export function AssistantComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  options,
  hero,
  workflowId,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onSend: (text: string) => void
  disabled: boolean
  placeholder: string
  options: ComposerOptions
  hero: boolean
  /** Set in a workflow chat, where Inky can only read that workflow's runs. */
  workflowId?: string
}>) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [problems, setProblems] = useState<string[]>([])
  async function attach(files: FileList | null) {
    if (!files) return
    const result = await readAttachments([...files], options.attachments)
    options.onAttachmentsChange(result.attachments)
    setProblems(result.problems)
  }
  const [modelOpen, setModelOpen] = useState(false)
  const canSend = value.trim().length > 0 && !disabled
  function submit() {
    if (!canSend) return
    if (options.model === null) {
      setModelOpen(true)
      return
    }
    onSend(value.trim())
    onChange("")
  }
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      submit()
    }
  }
  return (
    <div
      data-shortcut-scope="composer"
      className={cn(!hero && "border-t border-border p-3")}
    >
      <InputGroup className="mx-auto max-w-3xl rounded-2xl shadow-sm">
        {options.attachments.length > 0 ? (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
            {options.attachments.map((file) => (
              <Badge key={file.name} variant="secondary" className="pr-1">
                <FileTextIcon />
                <span className="max-w-40 truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${file.name}`}
                  className="size-4 rounded-full"
                  onClick={() =>
                    options.onAttachmentsChange(
                      options.attachments.filter((item) => item !== file)
                    )
                  }
                >
                  <XIcon className="size-3" />
                </Button>
              </Badge>
            ))}
          </InputGroupAddon>
        ) : null}
        <ComposerInput
          label={`Message ${ASSISTANT_NAME}`}
          value={value}
          onChange={onChange}
          onSendKey={submitOnEnter}
          placeholder={placeholder}
          hero={hero}
          workflowId={workflowId}
        />
        <InputGroupAddon align="block-end" className="gap-1">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void attach(event.target.files)
              event.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={options.model === null}
            aria-label="Attach files"
            onClick={() => fileInput.current?.click()}
          >
            <PaperclipIcon />
          </Button>
          <ToolsMenu options={options} />
          <div className="ml-auto flex min-w-0 items-center gap-1">
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
              {...shortcutTarget("send")}
            >
              <ArrowUpIcon />
            </Button>
          </div>
        </InputGroupAddon>
      </InputGroup>
      {problems.length > 0 ? (
        <p className="mx-auto mt-2 max-w-3xl text-sm text-destructive">
          {problems.join(" · ")}
        </p>
      ) : null}
    </div>
  )
}
