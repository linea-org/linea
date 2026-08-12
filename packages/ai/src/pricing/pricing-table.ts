export type ModelPrice = {
  inputMicrosPerToken: number
  outputMicrosPerToken: number
}

// $ per million tokens and micros per token are the same number — used directly, no conversion.
const modelPricing: Record<string, ModelPrice> = {
  "claude-opus-5": { inputMicrosPerToken: 5.0, outputMicrosPerToken: 25.0 },
  "claude-sonnet-5": { inputMicrosPerToken: 2.0, outputMicrosPerToken: 10.0 },
  "claude-fable-5": { inputMicrosPerToken: 10.0, outputMicrosPerToken: 50.0 },
  "claude-haiku-4-5-20251001": {
    inputMicrosPerToken: 1.0,
    outputMicrosPerToken: 5.0,
  },

  "gpt-5": { inputMicrosPerToken: 1.25, outputMicrosPerToken: 10.0 },
  "gpt-5-mini": { inputMicrosPerToken: 0.25, outputMicrosPerToken: 2.0 },
  "gpt-4.1": { inputMicrosPerToken: 2.0, outputMicrosPerToken: 8.0 },
  "gpt-4o": { inputMicrosPerToken: 2.5, outputMicrosPerToken: 10.0 },

  "llama-3.1-8b-instant": {
    inputMicrosPerToken: 0.05,
    outputMicrosPerToken: 0.08,
  },
  "llama-3.3-70b-versatile": {
    inputMicrosPerToken: 0.59,
    outputMicrosPerToken: 0.79,
  },
  "openai/gpt-oss-120b": {
    inputMicrosPerToken: 0.15,
    outputMicrosPerToken: 0.6,
  },
  "openai/gpt-oss-20b": {
    inputMicrosPerToken: 0.075,
    outputMicrosPerToken: 0.3,
  },

  // groq/compound, groq/compound-mini omitted: no fixed per-token rate exists to give them.
}

const GROK_4_5_TIER_THRESHOLD_TOKENS = 200_000
const grok45Pricing = {
  under: { inputMicrosPerToken: 2.0, outputMicrosPerToken: 6.0 },
  atOrOver: { inputMicrosPerToken: 4.0, outputMicrosPerToken: 12.0 },
}

function getModelPrice(
  model: string,
  tokensInput: number
): ModelPrice | undefined {
  if (model === "grok-4.5") {
    return tokensInput >= GROK_4_5_TIER_THRESHOLD_TOKENS
      ? grok45Pricing.atOrOver
      : grok45Pricing.under
  }
  return modelPricing[model]
}

// undefined, not 0n, so an unpriced model isn't mistaken for a free one.
export function calculateCostMicros(
  model: string,
  tokensInput: number,
  tokensOutput: number
): bigint | undefined {
  const price = getModelPrice(model, tokensInput)
  if (!price) return undefined
  return BigInt(
    Math.round(
      tokensInput * price.inputMicrosPerToken +
        tokensOutput * price.outputMicrosPerToken
    )
  )
}
