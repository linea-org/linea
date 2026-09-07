# Version only the public developer interface

Developer-facing endpoints, webhooks, OpenAPI, and both SDK clients will use `/v1`, while dashboard-only endpoints remain internal and unversioned. Applying public compatibility constraints to the dashboard would slow coordinated product changes, while leaving third-party interfaces unversioned would make the goal of supporting arbitrary Operator applications unsafe; the product is not deployed, so no legacy public aliases are required.
