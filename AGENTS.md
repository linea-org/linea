# Agent Rules

These rules apply to every file touched in this repo, whether by a human or an
AI coding agent. Follow them strictly.

## Comments

- Only add a comment when the WHY is non-obvious: a hidden constraint, a
  subtle invariant, a specific bug workaround.
- Never explain what the code does — well-named identifiers already do that.
- No multi-line comment blocks. One short line max.
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
- All text (code, strings, comments) must be continuous — no blank lines
  inside a function or block body.
- A single blank line between top-level declarations is fine. Inside a
  function, never.

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
- No abstraction until there are at least three concrete use-sites.
  Duplication is cheaper than the wrong abstraction.
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
  add `"use client"` directives, they have no effect here.
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
  then confine it to one cast at the boundary.
- Prefer `type` over `interface` for object shapes that won't be extended.
  Use `interface` for contracts that will be implemented or extended.
- Never cast with `as` to paper over a type error — fix the type.

## Branching and commits

- One branch per issue: `fix/<slug>` or `feat/<slug>`.
- Open a PR before moving on. Never bulk-commit unrelated changes to
  `main`.
- No co-authorship lines in commit messages.
- Resolve merge conflicts by understanding both sides — never blindly
  accept one side.
