# Evaluate feature flags server-side with ConfigCat

Feature flags live in ConfigCat, read through the `@configcat/sdk` package from one shared `@linealabs/flags` package. Every flag is declared in code with its key and description, so code can only ask for flags that exist; whether it is on is decided only in ConfigCat. Flags are evaluated per workspace, with the workspace id as the ConfigCat User identifier; turning a feature on for some workspaces is a ConfigCat targeting rule on that identifier, not a row in a Linea table. We chose a hosted flag service over our own overrides table so that admins toggle features without a deploy, a migration or an admin UI we would have to build and secure.

Evaluation happens only on the server (API and workers). The web app reads the values already evaluated for its workspace from the API through `useFlag`, and never loads the ConfigCat SDK: the browser SDK downloads the whole config, which would expose every workspace id named in a targeting rule to any signed-in user. A disabled feature is refused by the API, so hiding it in the UI is a convenience rather than the boundary.

When ConfigCat is unreachable the SDK keeps serving the last config it fetched; before the first successful fetch every flag is off. A process in production refuses to start without `CONFIGCAT_SDK_KEY`, or while ConfigCat answers but lacks a declared on/off flag, so a mistyped key cannot silently mean off; a ConfigCat outage does not stop it. Local development and CI may run without a key, and every flag is then off. Tests of flagged code mock `@linealabs/flags`.

`platform_model_key_enabled` became the `platformModelKey` flag, and its column was dropped.
