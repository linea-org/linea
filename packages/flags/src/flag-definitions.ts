/** Every flag the code may ask for; each is an on/off flag of the same key in ConfigCat. */
export const FLAGS = {
  platformModelKey:
    "Steps and Inky may fall back to Linea's own model provider key when the workspace has none.",
  assistantMentions:
    "Inky's composer offers a picker of runs, Workflows and Applications when the user types @.",
  parallelBranches:
    "Independent branches of a Workflow run several steps at once instead of one at a time.",
  // Off switches are named for the pause, so that off, the value without ConfigCat, is normal.
  pauseConnectorWrites:
    "Connector writes fail before they reach the provider; reads and writes already sent go on.",
  pauseMcpTools: "Steps that use MCP servers fail before they connect.",
  pauseInkyWeb: "Inky cannot browse the web.",
  pauseWebhooks:
    "Webhook deliveries wait, without using an attempt, until this is off.",
} as const satisfies Record<string, string>

export type FlagKey = keyof typeof FLAGS

export const FLAG_KEYS = Object.keys(FLAGS).filter(
  (key): key is FlagKey => key in FLAGS
)
