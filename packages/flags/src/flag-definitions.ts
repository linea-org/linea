/** Every flag the code may ask for; each is an on/off flag of the same key in ConfigCat. */
export const FLAGS = {
  platformModelKey:
    "Steps and Inky may fall back to Linea's own model provider key when the workspace has none.",
  assistantMentions:
    "Inky's composer offers a picker of runs, Workflows and Applications when the user types @.",
  parallelBranches:
    "Independent branches of a Workflow run several steps at once instead of one at a time.",
} as const satisfies Record<string, string>

export type FlagKey = keyof typeof FLAGS

export const FLAG_KEYS = Object.keys(FLAGS).filter(
  (key): key is FlagKey => key in FLAGS
)
