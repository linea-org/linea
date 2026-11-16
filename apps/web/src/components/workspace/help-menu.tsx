import { BookOpenIcon, CircleHelpIcon, MessageCircleIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"

const DOCS_URL = "https://docs.getlinea.app"
const COMMUNITY_URL = "https://discord.gg/7FWR97VkBD"

export function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        <CircleHelpIcon />
        <span className="hidden sm:inline">Help</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem
          render={
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <BookOpenIcon />
          Documentation
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <MessageCircleIcon />
          Chat with us on Discord
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
