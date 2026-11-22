export type FlagDefinition = { default: boolean; description: string }

export const FLAGS = {
  platformModelKey: {
    default: false,
    description:
      "Steps and Inky may fall back to Linea's own model provider key when the workspace has none.",
  },
} as const satisfies Record<string, FlagDefinition>

export type FlagKey = keyof typeof FLAGS
