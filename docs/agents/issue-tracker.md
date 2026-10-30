# Issue tracker: GitHub

Specs and tickets live in `linea-org/linea`. Use the `gh` CLI with
`--repo linea-org/linea` explicitly because origin points to a fork.

- Read issues with their body, labels, and comments.
- Publish multiline bodies using `--body-file`.
- Link child tickets through native sub-issue relationships.
- Record dependencies through native blocking relationships; if unavailable,
  include a `Blocked by` list referencing the blocking issues.
- A ticket can start when all its blockers are closed.
- Apply the labels defined in `docs/agents/triage-labels.md`.

PRs as a request surface: no.
