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

A pull request that breaks the public API fails a check. If it has to, say why and
ask for the label `breaking`.

Report security problems as described in [SECURITY.md](SECURITY.md).
