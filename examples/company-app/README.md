# Company app example

A small company app that lets its End Users ask a deployed Linea Agent to
suggest two follow-up GitHub issues and review each write before it happens.
It shows who configures what.

> **Demo only, not production-ready.** A shared access code stands in for real
> sign-in, sessions live in memory, and the server speaks plain HTTP. Before
> putting anything like this on a reachable host, replace the access code with
> your own authentication, use durable sessions, and serve it over TLS.

## Who owns what

| Company developer (you)                                                   | End User (your customer)                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Creates the Application, Agent, GitHub Connection and the Environment key | Types a repository and sees progress and results         |
| Keeps `LINEA_ENVIRONMENT_KEY` on the server only                          | Never sees model IDs, tokens, raw JSON or internal IDs   |
| Assigns the separate reviewer in Linea                                    | Reviews exact proposed actions only if assigned reviewer |
| Opens the **Developer view** link to inspect the same Execution in Linea  | A requester's access alone cannot approve an action      |

## Prerequisites

1. In Linea, publish an Agent whose Contract takes `{ "repository": string }`
   and deploy it to an Environment (Agent → Deployment).
2. Add a GitHub Connection to that Environment and assign a requester grant
   and a separate reviewer. Use a GitHub App installation limited to the
   repositories you list in `ALLOWED_REPOSITORIES`.
3. Create an Environment key (Environment → Keys) with only the scopes this
   example uses: `subjects:provision`, `executions:start` and
   `executions:read`. Treat it like a password.
4. Find the Environment ID and the Agent ID in the Linea UI.
5. To let people sign in and review on the page, edit the Environment's trust
   settings: add `http://localhost:4000` to **Allowed browser origins** and to
   **Allowed redirect origins**, configure your identity provider details, and
   register `http://localhost:4000/` as a redirect URI at the identity provider.

## Run

```bash
export LINEA_ENVIRONMENT_ID=...        # Environment ID
export LINEA_ENVIRONMENT_KEY=lin_env_… # server-side only
export LINEA_AGENT_ID=...              # the deployed Agent
export LINEA_WORKSPACE_SLUG=...        # for the Developer view link
export DEMO_END_USER_SUBJECT=demo-user # the End User's identity in your IdP
# a random code of at least 16 characters; share it only with your visitors
export DEMO_ACCESS_CODE="$(node -e 'console.log(crypto.randomBytes(18).toString("base64url"))')"
echo "$DEMO_ACCESS_CODE"
export ALLOWED_REPOSITORIES=acme/demo  # comma-separated owner/name visitors may target
# optional: LINEA_API_URL (default http://localhost:3000; the browser calls it too),
#           LINEA_DASHBOARD_URL (default http://localhost:3001), PORT (4000),
#           HOST (127.0.0.1), PUBLIC_ORIGIN (http://localhost:$PORT)
pnpm install
pnpm --filter linea-company-app-example start   # builds the SDK packages, then the page
```

Open http://localhost:4000 (the address must match `PUBLIC_ORIGIN`, so not
`127.0.0.1`), enter the access code when asked, and use **Sign out of the
demo** to end the session. The server starts the Agent through the Environment
API and returns the Execution identifier; the page follows progress through
your server and links to the same Execution in Linea.

## Notes

- A visitor must enter `DEMO_ACCESS_CODE` (at least 16 characters) before
  anything starts, and each signed-in browser can only read the tasks it
  started. This stands in for your real sign-in: a production app
  authenticates its user and derives the End User subject from that identity
  instead of using `DEMO_END_USER_SUBJECT`.
- Limits: 5 wrong codes per client address and 50 overall lock sign-in for
  15 minutes; at most 50 sessions at once, each lasting one hour or until
  sign-out; at most 5 tasks per session. Behind a proxy every visitor shares the
  proxy's address. All of this is in memory and resets on restart.
- Visitors can only target repositories in `ALLOWED_REPOSITORIES`, because the
  Agent runs with your GitHub Connection, not theirs.
- The server binds to 127.0.0.1. To listen elsewhere (`HOST=0.0.0.0`), set
  `PUBLIC_ORIGIN` to the `https://` address visitors use; the server refuses
  to start otherwise. With an https origin the session cookie is
  `__Host-demo_session` and marked `Secure`. Requests that change state must
  come from `PUBLIC_ORIGIN`.
- The browser never receives the Environment key. It only talks to this
  example's server and, for reviews, to Linea with an End User session.
- Reviews appear through the End User session. Sign in with your identity
  provider as in `examples/sdk-react`; a signed-out visitor sees that reviews
  are unavailable rather than an Approve button.
- A failed request shows a general message. The public API reports every
  failure as `Execution failed`, so the page cannot tell the End User which
  action was rejected; developers see the full reason in the Developer view.
- If the outcome of an external write cannot be confirmed, the run stays
  stopped and the app never offers an automatic retry.
