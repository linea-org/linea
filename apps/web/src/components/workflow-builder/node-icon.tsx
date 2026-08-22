import {
  Brain,
  Braces,
  CircleStop,
  Clock,
  GitBranch,
  Globe,
  Play,
  Sparkles,
  Square,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Keyed by each definition's ui.icon — a static map so an unrecognized key falls back visibly instead of rendering nothing.
const ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  sparkles: Sparkles,
  "git-branch": GitBranch,
  braces: Braces,
  play: Play,
  "circle-stop": CircleStop,
  brain: Brain,
  clock: Clock,
}

export function NodeIcon({
  icon,
  className,
}: {
  icon: string
  className?: string
}) {
  const Icon = ICONS[icon] ?? Square
  return <Icon className={className} aria-hidden="true" />
}
