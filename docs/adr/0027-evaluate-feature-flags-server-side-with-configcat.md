# Evaluate feature flags server-side with ConfigCat

Feature flags live in ConfigCat, read through the `@configcat/sdk` package from one shared `@linealabs/flags` package. Every flag is declared in code with its key, default and description, so code can only ask for flags that exist. Flags are evaluated per workspace, with the workspace id as the ConfigCat User identifier; turning a feature on for some workspaces is a ConfigCat targeting rule on that identifier, not a row in a Linea table. We chose a hosted flag service over our own overrides table so that admins toggle features without a deploy, a migration or an admin UI we would have to build and secure.

Evaluation happens only on the server (API and workers). The web app reads the values already evaluated for its workspace from the API through `useFlag`, and never loads the ConfigCat SDK: the browser SDK downloads the whole config, which would expose every workspace id named in a targeting rule to any signed-in user. A disabled feature is refused by the API, so hiding it in the UI is a convenience rather than the boundary.

When ConfigCat is unreachable the SDK keeps serving the last config it fetched; before the first successful fetch every flag resolves to its declared default, which is always the off state for unreleased work. Production refuses to start without `CONFIGCAT_SDK_KEY`. Local development and CI run without an account: flags take their defaults, and `FEATURE_FLAGS` (a comma-separated list of flag keys) turns flags on for every workspace.

`platform_model_key_enabled` becomes the `platformModelKey` flag. Its column stays in `workspace_settings` but is no longer read; it is dropped once every environment's granted workspaces are in the flag's targeting rule.
