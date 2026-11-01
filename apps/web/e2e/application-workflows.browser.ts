import { test, expect } from "@playwright/test"
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

test("preserves Environment drafts and one-time keys while organizing Application Workflows", async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const workspacePath = environment.AGENT_UI_APPLICATION_PATH.replace(
    /\/applications\/.*$/,
    ""
  )
  const slug = workspacePath.replace(/^\/w\//, "")
  const workflowName = `Issue analysis ${Date.now()}`
  const renamedWorkflow = `${workflowName} revised`
  await page.addInitScript(() =>
    localStorage.setItem("linea.whats-new.read", "broken-json")
  )
  await signInWorkspace({
    page,
    email: environment.AGENT_UI_EMAIL,
    password: environment.AGENT_UI_PASSWORD,
    slug,
  })
  await page.getByRole("button", { name: /^What's new/ }).click()
  await expect(page.getByRole("alert")).toContainText(
    "Could not load your announcement read status"
  )
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }).first()
  ).toBeDisabled()
  await page.evaluate(() => localStorage.removeItem("linea.whats-new.read"))
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByRole("alert")).not.toBeVisible()
  await page.getByRole("button", { name: "Mark all read", exact: true }).click()
  await page.keyboard.press("Escape")
  await page.goto(environment.AGENT_UI_APPLICATION_PATH)
  await expect(
    page.getByRole("tab", { name: "Agents", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await page.getByRole("tab", { name: /^Workflows/ }).click()
  await page
    .getByRole("button", { name: "Create Workflow", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("combobox", { name: "Application", exact: true })
  ).toBeDisabled()
  await dialog.getByLabel("Name", { exact: true }).fill(workflowName)
  await dialog
    .getByLabel("Description")
    .fill(
      "Analyze incoming issues and route proposed follow-up work for review."
    )
  await dialog
    .getByRole("button", { name: "Create Workflow", exact: true })
    .click()
  await expect(page).toHaveURL(/\/workflows\/[a-f0-9-]+\/builder$/)
  await expect(page.locator(".react-flow")).toBeVisible()
  await page
    .getByRole("button", { name: "Edit workflow name", exact: true })
    .click()
  await page
    .getByLabel("Workflow name", { exact: true })
    .fill("Discard this edit")
  await page.getByLabel("Workflow name", { exact: true }).press("Escape")
  await page
    .getByRole("button", { name: "Edit workflow name", exact: true })
    .click()
  await page.getByLabel("Workflow name", { exact: true }).fill(renamedWorkflow)
  await page.getByLabel("Workflow name", { exact: true }).press("Enter")
  await expect(page.getByText(renamedWorkflow, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await page
    .getByRole("link", { name: "Back to Application", exact: true })
    .click()
  await expect(page).toHaveURL(
    `${new URL(environment.AGENT_UI_APPLICATION_PATH, page.url()).href}?view=workflows`
  )
  const workflows = page.getByRole("region", {
    name: "Application Workflows",
    exact: true,
  })
  await expect(
    workflows.getByRole("link", { name: new RegExp(renamedWorkflow) })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Environments", exact: true }).click()
  const development = page.getByRole("region", {
    name: "Development Environment",
    exact: true,
  })
  const production = page.getByRole("region", {
    name: "Production Environment",
    exact: true,
  })
  const devIssuer = development.getByLabel("Identity provider issuer", {
    exact: true,
  })
  await devIssuer.fill("https://dev-draft.example.test")
  await page.getByRole("tab", { name: "Production", exact: true }).click()
  await production
    .getByLabel("Identity provider issuer", { exact: true })
    .fill("https://prod-draft.example.test")
  await page.getByRole("tab", { name: "Development", exact: true }).click()
  await expect(devIssuer).toHaveValue("https://dev-draft.example.test")
  const retention = development.getByLabel("Content retention in days", {
    exact: true,
  })
  const retainedDays = (await retention.inputValue()) === "45" ? "46" : "45"
  await retention.fill(retainedDays)
  await development
    .getByRole("button", { name: "Save retention", exact: true })
    .click()
  await expect(
    development.getByRole("status").filter({ hasText: "Retention saved." })
  ).toBeVisible()
  await development
    .getByRole("button", { name: "Disable Environment", exact: true })
    .click()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("alertdialog")).not.toBeVisible()
  await page.addStyleTag({ content: "code { visibility: hidden !important; }" })
  const keyName = `Browser persistence ${Date.now()}`
  await development.getByLabel("Key name", { exact: true }).fill(keyName)
  await development
    .getByRole("checkbox", { name: "executions · read", exact: true })
    .check()
  await development
    .getByRole("button", { name: "Create key", exact: true })
    .click()
  const keyNotice = development.getByText(
    "Copy this key now. It is shown once.",
    { exact: true }
  )
  await expect(keyNotice).toBeVisible()
  const keyText = keyNotice.locator("..").locator("code")
  const originalKey = await keyText.textContent()
  expect(Boolean(originalKey)).toBe(true)
  await page.getByRole("tab", { name: "Production", exact: true }).click()
  await expect(
    production.getByLabel("Identity provider issuer", { exact: true })
  ).toHaveValue("https://prod-draft.example.test")
  await page.getByRole("tab", { name: "Development", exact: true }).click()
  expect((await keyText.textContent()) === originalKey).toBe(true)
  await page.getByRole("tab", { name: "Agents", exact: true }).click()
  await page.getByRole("tab", { name: "Environments", exact: true }).click()
  expect((await keyText.textContent()) === originalKey).toBe(true)
  await expect(devIssuer).toHaveValue("https://dev-draft.example.test")
  await expect(retention).toHaveValue(retainedDays)
  const keyRow = development
    .getByText(new RegExp(`^${keyName} ·`))
    .locator("..")
  await keyRow.getByRole("button", { name: "Revoke", exact: true }).click()
  await expect(keyRow).toContainText("Revoked")
  await keyNotice
    .locator("..")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click()
  await expect(keyNotice).not.toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("environment-drafts.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: testInfo.outputPath("environment-drafts-dark.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await development.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("environment-drafts-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto(`${workspacePath}/applications`)
  await page
    .getByRole("button", { name: "Create Application", exact: true })
    .click()
  const applicationName = `Support ${Date.now()}`
  await dialog.getByLabel("Name", { exact: true }).fill(applicationName)
  const customSlug = `support-${Date.now()}`
  await dialog.getByLabel("Slug", { exact: true }).fill(customSlug)
  await dialog
    .getByLabel("Name", { exact: true })
    .fill(`${applicationName} revised`)
  await expect(dialog.getByLabel("Slug", { exact: true })).toHaveValue(
    customSlug
  )
  await dialog
    .getByRole("button", { name: "Create Application", exact: true })
    .click()
  await expect(
    page.getByRole("heading", {
      name: `${applicationName} revised`,
      exact: true,
    })
  ).toBeVisible()
  await page.getByRole("tab", { name: /^Workflows/ }).click()
  await expect(
    page.getByRole("link", { name: new RegExp(renamedWorkflow) })
  ).not.toBeVisible()
  await page
    .getByRole("link", { name: "Back to Applications", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Applications", exact: true })
  ).toBeVisible()
  expect(errors).toEqual([])
})
