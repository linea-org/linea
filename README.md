# Linea

The open-source SDKs, wire protocol and examples for
[Linea](https://www.getlinea.app), the platform for building and operating
production agents.

[Documentation](https://docs.getlinea.app) ·
[Start building](https://platform.getlinea.app) ·
[Discord](https://discord.gg/7FWR97VkBD)

| Package                                      | What it is                                                   |
| -------------------------------------------- | ------------------------------------------------------------ |
| [`@linealabs/sdk`](packages/sdk)             | Server, browser and native clients, and webhook verification |
| [`@linealabs/sdk-react`](packages/sdk-react) | React hooks and components, and the CopilotKit adapter       |
| [`protocol`](packages/protocol)              | The schemas of the public `/v1` API, bundled into both SDKs  |

[`examples`](examples) has working applications, and
[`docs/openapi.json`](docs/openapi.json) describes the API.

## Develop

Needs Node.js from [`.nvmrc`](.nvmrc) and pnpm 10.

```sh
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under
[Apache 2.0](LICENSE).
