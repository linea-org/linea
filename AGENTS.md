# Agent Rules

These rules apply to every file touched in this repo, whether by a human or an
AI coding agent. Follow them strictly.

## Comments

- Only add a comment when the WHY is non-obvious: a hidden constraint, a
  subtle invariant, a specific bug workaround.
- Never explain what the code does — well-named identifiers already do that.
- Keep a comment to one or two lines, wrapped at 100 columns. A rationale
  that needs more belongs in an ADR under `docs/adr/`, with a one-line
  comment pointing at it.
- Same exception for exported functions, types, and other public
  declarations: add a one-line `/** ... */` only when the contract isn't
  derivable from the name, types, and signature (an invariant it enforces,
  what happens on a race, what it deliberately does not do). A function
  whose name and types already say everything gets no comment at all — don't
  add one just to have documentation coverage.
- A note that applies to every function in a file (a module-wide boundary
  like "encryption happens at the call site") is a file-level comment at the
  top, not repeated per function.

## Formatting

- Formatting itself is enforced by Prettier (`pnpm format`, checked in CI via
  `pnpm format:check`) — don't hand-format against it.
- A single blank line between top-level declarations.
- Inside a function, a blank line may separate distinct phases. A function
  that needs many of them is too long: split it. ESLint warns above 150
  lines (`max-lines-per-function`) and above 5 parameters (`max-params`).

## Icons

- Use `lucide-react` for icons — it's the standard icon set already wired
  into `@linea/ui` and `apps/web`. Don't introduce a second icon library.

## File structure

- Each file owns one feature or logical concern. When a second concern
  appears, create a new file.
- Name files after what they do, not what they contain
  (`use-execution-stream.ts`, not `hooks.ts`).
- Co-locate related types, hooks, and helpers with the feature they serve
  rather than dumping them in a shared `utils/`.
- Shared code belongs in `packages/*`, never in a cross-app import. Apps
  under `apps/*` should not import from one another directly.

## Code size

- Write the minimum code that correctly solves the problem. If the same
  outcome is achievable in fewer lines without sacrificing clarity, write
  fewer lines.
- No abstraction until there are three concrete use-sites. At the third copy,
  extract it — a helper copied more than twice is a bug waiting to diverge.
- No optional parameters, overloads, or config objects added "for future
  flexibility" — design for what is needed now.

## Error handling

- Throw errors instead of silently falling back to a wrong value. A loud
  failure is always better than silent incorrect data.
- Only validate at system boundaries (user input, external API responses).
  Trust internal code and framework guarantees.
- Never swallow errors in a catch block without re-throwing or surfacing
  them.

## Output quality

- Before reporting a change done, run `pnpm lint`, `pnpm typecheck`, and
  `pnpm format:check` (or the equivalent `pnpm --filter <package> ...`
  scoped to what changed). These are the same checks CI runs.
- Never leave `console.log`, `TODO`, `FIXME`, debug artifacts, or
  placeholder comments in final output.
- No test stubs or dummy implementations in production code paths.
- Never generate documentation files (`*.md`) unless explicitly asked.

## React

- This app (TanStack Start) doesn't use React Server Components — don't
  add `"use client"` directives, they have no effect here. `packages/ui` is
  vendored shadcn and keeps its upstream directives and style.
- Keep components small — if a component needs more than one screen to
  read, split it.
- Co-locate state as close to where it is used as possible. Lift only when
  truly shared.
- No prop drilling beyond two levels — use context or a dedicated hook.

## Forms

- Any new form (multiple related input fields with validation and/or a
  submit action) must use `react-hook-form` (`useForm`, `register`/
  `Controller`) rather than one `useState` per field.
- Existing `useState`-based forms are not migrated as a matter of course —
  don't rewrite one incidentally while touching nearby code; only convert
  it if asked.
- A single standalone input with no validation (a search box, an inline
  rename field) doesn't need `react-hook-form` — reserve it for actual
  forms.

## TypeScript

- No `any` unless interfacing with an untyped external boundary, and even
  then confine it to one cast at the boundary. ESLint enforces
  `no-explicit-any` and `no-console` (`warn` and `error` are allowed).
- Prefer `type` over `interface` for object shapes that won't be extended.
  Use `interface` for contracts that will be implemented or extended.
- Never cast with `as` to paper over a type error — fix the type.

## Design system

- Colors are CSS variable tokens from `packages/ui/src/styles/globals.css`
  (`bg-card`, `text-muted-foreground`, `bg-surface-canvas`, ...), never a raw
  hex/oklch value in a component. Adding a genuinely new color means adding a
  token to `globals.css` (light and dark) and wiring it into `@theme inline`,
  not inlining it at the call site.
- Elevation: surfaces get lighter the higher they float above the canvas —
  `--surface-canvas` (deepest) → `--card` (a node) → `--popover` (a dialog,
  sheet, or modal — the topmost floating layer). A new floating surface reuses
  `--popover`; a new base surface reuses `--surface-canvas`. Don't invent a
  one-off background color for a new panel.
- Use only `@linea/ui` components in the app (`Button`, `Card`, `Badge`,
  `Sidebar`, `Sheet`, `Field`, `Select`, ...). Never hand-roll a card, badge,
  button, or other element that has a component in
  `packages/ui/src/components/`, and don't add a one-off component to
  `apps/web` when a `@linea/ui` one exists. Check that directory first; if
  nothing fits, extend the `@linea/ui` component rather than forking it.
- A feature with several variants (node types, flag types, ...) gets one
  generic, data/schema-driven component plus a registry of metadata — never a
  separate component per variant, and never the variant's presentation
  metadata (icon, color, label, form fields) scattered across several files.
  `packages/runtime/src/nodes/node-definition.ts`'s `ui` block is the
  reference example: add a node type by writing one definition file and
  registering it, and the palette/canvas/config-panel all pick it up with no
  other file touched.
- Third-party library default styling (a canvas library's controls/minimap,
  etc.) must be re-themed to the token system — a component that ships its
  own hardcoded light-mode colors will break in dark mode and needs explicit
  overrides, not left as-is.

## Branching and commits

- One branch per issue: `fix/<slug>` or `feat/<slug>`.
- Open a PR before moving on. Never bulk-commit unrelated changes to
  `main`.
- No co-authorship lines in commit messages.
- Resolve merge conflicts by understanding both sides — never blindly
  accept one side.

## Agent skills

### Issue tracker

Before reading or publishing specs and tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Before triaging or labeling issues, read `docs/agents/triage-labels.md`.

### Domain docs

Before exploring domain behavior, read `docs/agents/domain.md`.
