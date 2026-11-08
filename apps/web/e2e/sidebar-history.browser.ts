import { expect, test } from "@playwright/test"
import { z } from "zod"
import { signInWorkspace } from "./sign-in-workspace"

const environment = z
  .object({
    AGENT_UI_EMAIL: z.email(),
    AGENT_UI_PASSWORD: z.string().min(1),
    AGENT_UI_APPLICATION_PATH: z
      .string()
      .regex(/^\/w\/[a-z0-9-]+\/applications\/[a-f0-9-]+$/),
  })
  .parse(process.env)

test("sidebar Back restores visited menus, and from the first layer returns to the previous page", async ({
  page,
}) => {
  const applicationPath = environment.AGENT_UI_APPLICATION_PATH
  const workspacePath = applicationPath.replace(/\/applications\/.*$/, "")
  await signInWorkspace({
    page,
    email: environment.AGENT_UI_EMAIL,
    password: environment.AGENT_UI_PASSWORD,
    slug: workspacePath.replace(/^\/w\//, ""),
  })
  await page.getByRole("link", { name: "Applications", exact: true }).click()
  await page.locator(`a[href="${applicationPath}"]`).click()
  const environmentToggle = page.getByRole("button", {
    name: "Environments",
    exact: true,
  })
  await environmentToggle.click()
  await expect(environmentToggle).toHaveAttribute("aria-expanded", "true")
  const firstAgent = page
    .getByRole("region", { name: "Application Agents", exact: true })
    .getByRole("link")
    .first()
  await firstAgent.click()
  await expect(
    page.getByRole("link", { name: "Configuration", exact: true })
  ).toBeVisible()
  const agentUrl = page.url()
  const historyLength = await page.evaluate(() => window.history.length)
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page).toHaveURL(agentUrl)
  await expect(
    page.getByRole("heading", { name: "Configuration", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Configuration", exact: true })
  ).not.toBeVisible()
  await expect(environmentToggle).toHaveAttribute("aria-expanded", "true")
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.reload(),
  ])
  await expect(page).toHaveURL(agentUrl)
  await expect(environmentToggle).toHaveAttribute("aria-expanded", "true")
  await page.getByRole("link", { name: "Production", exact: true }).click()
  await expect(page).toHaveURL(
    `${applicationPath}?view=environments&environment=production`
  )
  await page.goBack()
  await expect(page).toHaveURL(agentUrl)
  await expect(
    page.getByRole("heading", { name: "Configuration", exact: true })
  ).toBeVisible()
  await expect(environmentToggle).toHaveAttribute("aria-expanded", "true")
  await page.goForward()
  await expect(page).toHaveURL(
    `${applicationPath}?view=environments&environment=production`
  )
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.reload(),
  ])
  const issuer = page
    .getByRole("region", { name: "Production Environment", exact: true })
    .getByLabel("Identity provider issuer", { exact: true })
  await issuer.fill("https://sidebar-draft.example.test")
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page).toHaveURL(`${workspacePath}/applications`)
  await expect(
    page.getByRole("link", { name: "Applications", exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Workflows", exact: true }).click()
  await expect(page).toHaveURL(`${workspacePath}/workflows`)
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page).toHaveURL(`${workspacePath}/applications`)
  await expect(
    page.getByRole("link", { name: "Applications", exact: true })
  ).toBeVisible()
})
