export type FlagDefinition = { default: boolean; description: string }

export const FLAGS = {
  platformModelKey: {
    default: false,
    description:
      "Steps and Inky may fall back to Linea's own model provider key when the workspace has none.",
  },
  assistantMentions: {
    default: false,
    description:
      "Inky's composer offers a picker of runs, Workflows and Applications when the user types @.",
  },
} as const satisfies Record<string, FlagDefinition>

export type FlagKey = keyof typeof FLAGS
