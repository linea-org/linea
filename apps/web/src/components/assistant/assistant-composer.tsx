import { useRef, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import {
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  PaperclipIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@linea/ui/components/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
import { Switch } from "@linea/ui/components/switch"
import { cn } from "@linea/ui/lib/utils"

import { ASSISTANT_NAME } from "@/lib/assistant-api"
import { readAttachments } from "@/lib/attachments"
import type { ComposerOptions } from "./use-composer-options"

function ToolsMenu({ options }: { options: ComposerOptions }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="xs" aria-label="Tools" />
        }
      >
        <WrenchIcon />
        Tools
        {options.web ? <Badge variant="info">1</Badge> : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium">Browse the web</p>
          <Switch
            checked={options.web}
            onCheckedChange={options.onWebChange}
            aria-label="Browse the web"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ModelMenu({ options }: { options: ComposerOptions }) {
  const { slug } = useParams({ strict: false })
  const providers = [
    ...new Map(
      options.models.map((model) => [model.providerId, model.providerLabel])
    ),
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={options.models.length === 0}
            aria-label="Model"
          />
        }
      >
        {options.model?.label ?? "Choose a model"}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuRadioGroup
          value={options.model?.value ?? ""}
          onValueChange={options.onModelChange}
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
                  {hasKey ? "" : " · no key"}
                </DropdownMenuLabel>
                {providerModels.map((model) => (
                  <DropdownMenuRadioItem
                    key={model.value}
                    value={model.value}
                    disabled={!hasKey}
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
              render={<Link to="/w/$slug/settings/models" params={{ slug }} />}
            >
              Manage keys
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
}: {
  value: string
  onChange: (value: string) => void
  onSend: (text: string) => void
  disabled: boolean
  placeholder: string
  options: ComposerOptions
  hero: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [problems, setProblems] = useState<string[]>([])
  async function attach(files: FileList | null) {
    if (!files) return
    const result = await readAttachments([...files], options.attachments)
    options.onAttachmentsChange(result.attachments)
    setProblems(result.problems)
  }
  const canSend = value.trim().length > 0 && !disabled && options.model !== null
  function submit() {
    if (!canSend) return
    onSend(value.trim())
    onChange("")
  }
  return (
    <div className={cn(!hero && "px-4 pb-4")}>
      <InputGroup className="mx-auto max-w-[720px] rounded-2xl shadow-sm">
        {options.attachments.length > 0 ? (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
            {options.attachments.map((file) => (
              <Badge key={file.name} variant="secondary" className="pr-1">
                <FileTextIcon />
                <span className="max-w-40 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                  onClick={() =>
                    options.onAttachmentsChange(
                      options.attachments.filter((item) => item !== file)
                    )
                  }
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </InputGroupAddon>
        ) : null}
        <InputGroupTextarea
          aria-label={`Message ${ASSISTANT_NAME}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          rows={hero ? 3 : 2}
          autoFocus={hero}
          className={cn("max-h-60", hero ? "min-h-24 text-sm" : "min-h-12")}
        />
        <InputGroupAddon align="block-end">
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
            size="icon-xs"
            aria-label="Attach files"
            onClick={() => fileInput.current?.click()}
          >
            <PaperclipIcon />
          </Button>
          <ToolsMenu options={options} />
          <div className="ml-auto flex items-center gap-1">
            <ModelMenu options={options} />
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </div>
        </InputGroupAddon>
      </InputGroup>
      {problems.length > 0 ? (
        <p className="mx-auto mt-2 max-w-[720px] text-xs text-destructive">
          {problems.join(" · ")}
        </p>
      ) : null}
    </div>
  )
}
