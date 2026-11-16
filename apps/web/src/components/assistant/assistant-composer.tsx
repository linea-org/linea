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

function ToolsMenu({ options }: Readonly<{ options: ComposerOptions }>) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Tools"
            className="relative"
          />
        }
      >
        <WrenchIcon />
        {options.web ? (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Browse the web</p>
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

function ModelMenu({ options }: Readonly<{ options: ComposerOptions }>) {
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
            disabled={options.models.length === 0}
            aria-label="Model"
            className="min-w-0 justify-start"
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
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onSend: (text: string) => void
  disabled: boolean
  placeholder: string
  options: ComposerOptions
  hero: boolean
}>) {
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
    <div className={cn(!hero && "border-t border-border p-3")}>
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
          className={cn("max-h-60", hero ? "min-h-24 text-base" : "min-h-12")}
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
            aria-label="Attach files"
            onClick={() => fileInput.current?.click()}
          >
            <PaperclipIcon />
          </Button>
          <ToolsMenu options={options} />
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <ModelMenu options={options} />
            <Button
              type="button"
              size="icon"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
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
