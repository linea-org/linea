import {
  BracesIcon,
  GitBranchIcon,
  RocketIcon,
  Settings2Icon,
} from "lucide-react"
import { z } from "zod"

export const agentSectionSchema = z.enum([
  "configuration",
  "contracts",
  "versions",
  "deployments",
])
export type AgentSection = z.infer<typeof agentSectionSchema>

export const agentSections = {
  configuration: {
    label: "Configuration",
    icon: Settings2Icon,
    description: "Define the task, model, and tools this Agent can use.",
  },
  contracts: {
    label: "API Contract",
    icon: BracesIcon,
    description:
      "Define the request your application sends and the result it receives.",
  },
  versions: {
    label: "Versions",
    icon: GitBranchIcon,
    description:
      "Review saved versions and publish the ones ready for deployment.",
  },
  deployments: {
    label: "Deployments",
    icon: RocketIcon,
    description: "Choose the published version served by each Environment.",
  },
} satisfies Record<
  AgentSection,
  { label: string; icon: typeof Settings2Icon; description: string }
>
