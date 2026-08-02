# platform-api

Nest API for the Linea workspace.

## Environment

Put shared values in the repo root:

- `.env` for committed-local defaults
- `.env.local` for machine-specific overrides
- `.env.example` as the checked-in template

Required variables:

- `PORT` for the HTTP listener

## Commands

- `pnpm --dir apps/platform-api start:dev`
- `pnpm --dir apps/platform-api build`
- `pnpm --dir apps/platform-api test`
