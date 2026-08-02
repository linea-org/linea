# CLAUDE.md

This file is Claude Code's entry point for working in this repo.

The coding rules Claude (and any other agent) must follow live in
[AGENTS.md](AGENTS.md) — read it before making changes. It's kept as a single
source of truth so it stays useful to every tool, not just Claude Code.

For setup, common commands, and the project layout, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Quick reference

```bash
pnpm install        # install dependencies
pnpm dev            # start apps in dev mode
pnpm lint           # eslint across all packages
pnpm typecheck      # tsc --noEmit across all packages
pnpm format:check   # prettier --check (matches CI)
pnpm test           # test suites across all packages
pnpm build          # production build of all apps/packages
```

Run `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` before considering
any change finished — these are exactly what CI checks on every PR.
