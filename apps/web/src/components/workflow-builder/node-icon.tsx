import {
  Brain,
  Braces,
  CalendarClock,
  CircleStop,
  ClipboardCheck,
  Clock,
  GitBranch,
  Globe,
  ListFilter,
  Merge,
  Play,
  ScanText,
  Sparkles,
  Square,
  UserCheck,
  Variable,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Keyed by each definition's ui.icon — a static map so an unrecognized key falls back visibly instead of rendering nothing.
const ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  sparkles: Sparkles,
  "git-branch": GitBranch,
  braces: Braces,
  "scan-text": ScanText,
  play: Play,
  "circle-stop": CircleStop,
  "clipboard-check": ClipboardCheck,
  brain: Brain,
  clock: Clock,
  variable: Variable,
  filter: ListFilter,
  merge: Merge,
  "calendar-clock": CalendarClock,
  "user-check": UserCheck,
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
