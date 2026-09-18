import { LineaUserClient } from "@linea/sdk/user"

const client = new LineaUserClient({
  applicationId: "80000000-0000-4000-8000-000000000008",
  baseUrl: "https://api.example",
})

function button(label: string, action: () => Promise<void>): HTMLButtonElement {
  const element = document.createElement("button")
  element.textContent = label
  element.addEventListener("click", () => void action())
  return element
}

async function authorize(): Promise<void> {
  const authorization = await client.startAuthorization({
    redirectUri: location.href.split("?")[0],
  })
  location.assign(authorization.authorizationUrl)
}

async function completeAuthorization(): Promise<void> {
  const callback = new URL(location.href)
  const code = callback.searchParams.get("code")
  const state = callback.searchParams.get("state")
  if (!code || !state) return
  await client.completeAuthorization({ code, state })
  history.replaceState({}, "", callback.pathname)
}

async function renderApprovals(container: HTMLElement): Promise<void> {
  const approvals = await client.listApprovalRequests()
  container.replaceChildren()
  for (const approval of approvals.data) {
    const item = document.createElement("article")
    const title = document.createElement("h2")
    title.textContent = approval.display.title
    item.append(
      title,
      button("Approve", async () => {
        await client.decide(approval.id, { decision: "approved" })
        await renderApprovals(container)
      }),
      button("Reject", async () => {
        await client.decide(approval.id, { decision: "rejected" })
        await renderApprovals(container)
      })
    )
    container.append(item)
  }
}

async function main(): Promise<void> {
  await completeAuthorization()
  const root = document.getElementById("app")
  if (!root) throw new Error("The app root element is missing")
  const approvals = document.createElement("section")
  root.append(
    button("Sign in", authorize),
    button("Refresh approvals", () => renderApprovals(approvals)),
    approvals
  )
  if (await client.session()) await renderApprovals(approvals)
}

await main()
