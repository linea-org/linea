# Contributing

Issues and pull requests are welcome.

Before opening a pull request, run:

```sh
pnpm format:check
pnpm check:contracts
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pack
```

Changed a public operation? Run `pnpm generate:contracts` and commit the result.

Report security problems as described in [SECURITY.md](SECURITY.md).
