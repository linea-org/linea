# Company app example

A small company app that lets its End Users ask a deployed Linea Agent to
suggest two follow-up GitHub issues and review each write before it happens.
It shows who configures what.

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
   and a separate reviewer.
3. Create an Environment key (Environment → Keys). Treat it like a password.
4. Find the Environment ID and the Agent ID in the Linea UI.

## Run

```bash
export LINEA_ENVIRONMENT_ID=...        # Environment ID
export LINEA_ENVIRONMENT_KEY=lin_env_… # server-side only
export LINEA_AGENT_ID=...              # the deployed Agent
export LINEA_WORKSPACE_SLUG=...        # for the Developer view link
export DEMO_END_USER_SUBJECT=demo-user # the End User's identity in your IdP
# optional: LINEA_API_URL (default http://localhost:3000),
#           LINEA_DASHBOARD_URL (default http://localhost:3001), PORT (4000)
pnpm --filter linea-company-app-example start
```

Open http://localhost:4000. The server starts the Agent through the Environment
API and returns the Execution identifier; the page follows progress through
your server and links to the same Execution in Linea.

## Notes

- The browser never receives the Environment key. It only talks to this
  example's server and, for reviews, to Linea with an End User session.
- Reviews appear through the End User session. Sign in with your identity
  provider as in `examples/sdk-react`; a signed-out visitor sees that reviews
  are unavailable rather than an Approve button.
- If the outcome of an external write cannot be confirmed, the run stays
  stopped and the app never offers an automatic retry.
