import { expect, type Page } from "@playwright/test"
import { z } from "zod"

export async function signInWorkspace({
  page,
  email,
  password,
  slug,
}: {
  page: Page
  email: string
  password: string
  slug: string
}) {
  const origin = new URL(
    process.env.AGENT_UI_BASE_URL ?? "http://localhost:3001"
  ).origin
  const login = await page.request.post("/v1/auth/sign-in/email", {
    headers: { origin },
    data: { email, password },
  })
  expect(login.ok()).toBe(true)
  const response = await page.request.get("/v1/auth/organization/list")
  expect(response.ok()).toBe(true)
  const organizations = z
    .array(z.object({ id: z.uuid(), slug: z.string() }))
    .parse(await response.json())
  const organization = organizations.find((item) => item.slug === slug)
  if (!organization) throw new Error(`Workspace ${slug} is unavailable`)
  const active = await page.request.post("/v1/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId: organization.id },
  })
  expect(active.ok()).toBe(true)
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.goto(`/w/${slug}`),
  ])
}
