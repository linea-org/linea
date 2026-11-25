# Contributing

Issues and pull requests are welcome.

These packages are developed together with the Linea platform and published
here with each release. An accepted pull request is applied there with your
authorship and closed when the release that contains it arrives.

Before opening a pull request, run:

```sh
pnpm format:check
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pack
```

Report security problems as described in [SECURITY.md](SECURITY.md).
