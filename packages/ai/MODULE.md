# packages/ai

The shared provider registry and key resolver every AI call routes through —
Anthropic, OpenAI, Groq, and xAI (Grok chat), keyed explicitly rather than
inferred from a model name string.

## Non-obvious invariants

- **`resolveApiKey` currently returns a workspace's stored key as
  plaintext.** No encryption utility exists anywhere in this repo yet — the
  `secrets` table's `encryptedValue` column is opaque storage, and
  encrypting/decrypting is documented as the call site's job
  (`packages/db/MODULE.md`). This package is that call site, and it doesn't
  encrypt or decrypt anything yet. This is a tracked gap, not an oversight —
  see `roadmap.md`'s Phase 1 secrets work. Don't use this for a real
  customer's key before that lands.
- **The registry maps a model id to a provider explicitly**, one entry per
  model, rather than inferring the provider from the string (e.g. "starts
  with `gpt`"). A typo'd or unregistered model throws immediately instead of
  silently resolving to the wrong provider or no provider.
- **A workspace's own key always wins over the platform key.** `keyName`
  doubles as both the `secrets` table lookup key and the platform fallback's
  env var name (e.g. `ANTHROPIC_API_KEY`) — one name per provider serves
  both purposes, no separate provider → env-var mapping needed.
- **OpenAI, Groq, and xAI share one implementation**
  (`openai-compatible.provider.ts`), parameterized only by `baseURL` —
  all three publish an OpenAI-compatible chat completions endpoint, so
  there's no per-provider request/response mapping to duplicate. Anthropic
  doesn't fit this shape and has its own adapter.
- **Only chat/text models are registered for Groq and xAI.** Groq also
  hosts whisper (speech-to-text), TTS, and content-moderation models; xAI
  also has Grok Imagine (image/video) and a separate voice API. None of
  those are text completion — they need a different interface shape
  entirely and aren't wired up here.
- **The exact xAI base URL and Groq model ids are only as current as this
  file's last edit.** Groq's model list came from a live fetch of
  `console.groq.com/docs/models`; xAI's `grok-4.5` id and base URL are not
  independently verified against xAI's own docs. Check both before
  depending on either in production.
- **Every completion request is bounded by `maxTokens`, default 4096.**
  Every provider used to have its own default (Anthropic's was hardcoded,
  the OpenAI-compatible one had none at all, so Groq/xAI's own defaults
  applied unpredictably) — now all four go through the same
  `DEFAULT_MAX_TOKENS`, overridable per request. The OpenAI-compatible
  adapter deliberately sends `max_tokens`, not OpenAI's newer
  `max_completion_tokens` — that rename is specific to OpenAI's own
  o-series reasoning models, and Groq/xAI's compatibility layers are far
  more likely to honor the original field.

## Public surface

`registry`, `resolveProvider(model)`, `resolveApiKey(db, workspaceId, keyName)`,
`createOpenAiCompatibleProvider(baseURL?)`, and the `AiProvider` /
`CompletionRequest` / `CompletionResult` types.

## Deliberately not here

Google/Gemini — no adapter yet; same one-new-file pattern as the others
when it's needed. Embeddings — `AiProvider` only has `complete()`, no
`embed()`, until `packages/kb` needs one in Phase 4. Image, video, and
voice generation (Grok Imagine, Grok Voice, and equivalents from other
providers) — a different capability shape than text completion, not
attempted here. Real secrets encryption — see the invariant above.
