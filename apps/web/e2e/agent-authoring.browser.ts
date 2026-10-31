import { test, expect } from "@playwright/test"
import { z } from "zod"

const environment = z
  .object({
    AGENT_UI_EMAIL: z.email(),
    AGENT_UI_PASSWORD: z.string().min(1),
    AGENT_UI_APPLICATION_PATH: z
      .string()
      .regex(/^\/w\/[a-z0-9-]+\/applications\/[a-f0-9-]+$/),
  })
  .parse(process.env)

test("author, publish, and independently deploy immutable Agent versions", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto("/sign-in")
  await page
    .getByLabel("Email", { exact: true })
    .fill(environment.AGENT_UI_EMAIL)
  await page
    .getByLabel("Password", { exact: true })
    .fill(environment.AGENT_UI_PASSWORD)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).not.toHaveURL(/\/sign-in/)
  await page
    .getByRole("button", {
      name: new RegExp(
        environment.AGENT_UI_APPLICATION_PATH.replace(
          /^\/w\/([a-z0-9-]+)\/.*$/,
          "$1"
        )
      ),
    })
    .click()
  await expect(page).toHaveURL(/\/w\//)
  await page.goto(environment.AGENT_UI_APPLICATION_PATH)
  await page.getByRole("tab", { name: "Agents", exact: true }).click()
  await page.getByRole("button", { name: "Create Agent", exact: true }).click()
  const dialog = page.getByRole("dialog")
  const agentName = `GitHub issue analyst ${Date.now()}`
  await dialog.getByLabel("Name", { exact: true }).fill(agentName)
  await dialog
    .getByLabel("Slug", { exact: true })
    .fill(`github-analyst-${Date.now()}`)
  await dialog
    .getByLabel("Description")
    .fill(
      "Analyze repository issues and propose distinct follow-up issues for review."
    )
  await dialog
    .getByRole("button", { name: "Create Agent", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: agentName, exact: true })
  ).toBeVisible()
  const agentUrl = page.url()
  await expect(
    page.getByText(
      "Agent execution and trace inspection are not available yet.",
      { exact: false }
    )
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Save new version" })
  ).toBeDisabled()
  await page
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Analyze repository issues. Propose two distinct follow-up issues and respect each reviewer's decision."
    )
  await page.getByLabel("Model", { exact: true }).selectOption("gpt-5")
  await page
    .getByRole("button", { name: "Tools and execution limits", exact: true })
    .click()
  await page.getByLabel("Maximum iterations").fill("6")
  await expect(
    page.getByRole("heading", { name: "Development", exact: true })
  ).not.toBeVisible()
  await page
    .getByRole("button", { name: "Create Contract", exact: true })
    .click()
  await page.getByLabel("Input JSON Schema").fill("{")
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(
    page.getByText("Enter valid JSON", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Input JSON Schema").fill('{"type":"invalid"}')
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(page.getByRole("alert")).toContainText("schema is invalid")
  await page
    .getByLabel("Input JSON Schema")
    .fill(
      '{"type":"object","properties":{"task":{"type":"string"}},"required":["task"],"additionalProperties":false}'
    )
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(page.getByRole("tab", { name: "Contracts (1)" })).toBeVisible()
  await page.getByRole("tab", { name: "Definition", exact: true }).click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    /Propose two distinct/
  )
  await page
    .getByLabel("Public Contract revision")
    .selectOption({ label: "Revision 1" })
  await page.getByRole("button", { name: "Add tool" }).click()
  await page.getByLabel("Tool name", { exact: true }).fill("list_issues")
  await page
    .getByLabel("Connector Operation", { exact: true })
    .selectOption("github.issues.list")
  await page.getByRole("button", { name: "Add tool" }).click()
  await page.getByLabel("Tool name", { exact: true }).nth(1).fill("list_issues")
  await page
    .getByLabel("Connector Operation", { exact: true })
    .nth(1)
    .selectOption("github.issues.create")
  await page
    .getByRole("button", { name: "Tools and execution limits", exact: true })
    .click()
  await page.getByRole("button", { name: "Save new version" }).click()
  await expect(page.getByText("Tool names must be unique")).toBeVisible()
  await page
    .getByLabel("Tool name", { exact: true })
    .nth(1)
    .fill("create_issue")
  await page.getByRole("button", { name: "Save new version" }).click()
  await expect(page.getByRole("tab", { name: "Versions (1)" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  const development = page.getByRole("region").filter({
    has: page.getByRole("heading", { name: "Development", exact: true }),
  })
  const production = page.getByRole("region").filter({
    has: page.getByRole("heading", { name: "Production", exact: true }),
  })
  await page.getByRole("tab", { name: "Deployments", exact: true }).click()
  await expect(
    development.getByRole("button", { name: "Save deployment" })
  ).toBeDisabled()
  await page.getByRole("tab", { name: "Versions (1)" }).click()
  await page
    .getByRole("button", { name: "Inspect definition", exact: true })
    .click()
  await expect(
    page.getByRole("tabpanel", { name: "Versions (1)" })
  ).toContainText("github.issues.create")
  await page
    .getByRole("button", { name: "Publish version 1", exact: true })
    .click()
  await expect(page.getByText("Published", { exact: true })).toBeVisible()
  await page
    .getByRole("button", { name: "Manage deployments", exact: true })
    .click()
  await development
    .getByLabel("Published version and Contract")
    .selectOption({ label: "Version 1 · Contract revision 1" })
  await development.getByRole("button", { name: "Save deployment" }).click()
  await expect(
    development
      .getByRole("paragraph")
      .filter({ hasText: "Version 1 · Contract revision 1" })
  ).toBeVisible()
  await expect(
    production.getByText("Not deployed", { exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Contracts (1)" }).click()
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(page.getByRole("tab", { name: "Contracts (2)" })).toBeVisible()
  await page.getByRole("tab", { name: "Definition", exact: true }).click()
  await page
    .getByLabel("Public Contract revision")
    .selectOption({ label: "Revision 2" })
  await page
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Analyze repository issues. Report partial success honestly when a reviewer rejects a later proposal."
    )
  await page.getByRole("button", { name: "Save new version" }).click()
  await page
    .getByRole("button", { name: "Publish version 2", exact: true })
    .click()
  await page.getByRole("tab", { name: "Deployments", exact: true }).click()
  await production
    .getByLabel("Published version and Contract")
    .selectOption({ label: "Version 2 · Contract revision 2" })
  await production.getByRole("button", { name: "Save deployment" }).click()
  await expect(
    production
      .getByRole("paragraph")
      .filter({ hasText: "Version 2 · Contract revision 2" })
  ).toBeVisible()
  await page.reload()
  await page.getByRole("tab", { name: "Deployments", exact: true }).click()
  await expect(
    development
      .getByRole("paragraph")
      .filter({ hasText: "Version 1 · Contract revision 1" })
  ).toBeVisible()
  await expect(
    production
      .getByRole("paragraph")
      .filter({ hasText: "Version 2 · Contract revision 2" })
  ).toBeVisible()
  await production.getByLabel("Deployment status").selectOption("disabled")
  await production.getByRole("button", { name: "Save deployment" }).click()
  await expect(
    production.locator("[data-slot=badge]").filter({ hasText: "Disabled" })
  ).toBeVisible()
  await page.reload()
  await page.getByRole("tab", { name: "Deployments", exact: true }).click()
  await expect(production.getByLabel("Deployment status")).toHaveValue(
    "disabled"
  )
  await page.getByRole("tab", { name: "Definition", exact: true }).click()
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Unsaved instructions")
  await page.getByRole("tab", { name: "Versions (2)" }).click()
  await page.getByRole("button", { name: "Use as new version" }).last().click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await page.getByRole("button", { name: "Keep editing", exact: true }).click()
  await page.getByRole("tab", { name: "Definition", exact: true }).click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    "Unsaved instructions"
  )
  await page.getByRole("tab", { name: "Versions (2)" }).click()
  await page.getByRole("button", { name: "Use as new version" }).last().click()
  await page
    .getByRole("button", { name: "Replace changes", exact: true })
    .click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    /Propose two distinct/
  )
  await expect(
    page.getByLabel("Public Contract revision").locator("option:checked")
  ).toHaveText("Revision 1")
  await page.getByRole("tab", { name: "Versions (2)" }).click()
  await page.getByRole("button", { name: "Use as new version" }).first().click()
  await page
    .getByRole("button", { name: "Instructions and model", exact: true })
    .focus()
  await page.keyboard.press("Enter")
  await expect(
    page.getByLabel("Instructions", { exact: true })
  ).not.toBeVisible()
  await page.keyboard.press("Enter")
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    /Report partial success/
  )
  const editorWidth = await page
    .getByRole("tabpanel", { name: "Definition", exact: true })
    .evaluate((element) => element.getBoundingClientRect().width)
  const mainWidth = await page
    .locator("main")
    .last()
    .evaluate((element) => element.clientWidth)
  expect(editorWidth).toBeGreaterThan(mainWidth * 0.9)
  await page.getByRole("heading", { name: agentName, exact: true }).click()
  await page.emulateMedia({ colorScheme: "light" })
  await page.screenshot({
    path: testInfo.outputPath("agent-desktop.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: testInfo.outputPath("agent-desktop-dark.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        Array.from(document.querySelectorAll("main")).every(
          (main) => main.scrollWidth <= main.clientWidth
        )
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("agent-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.goto(environment.AGENT_UI_APPLICATION_PATH)
  await page.getByRole("tab", { name: "Agents", exact: true }).click()
  await page.getByRole("link", { name: new RegExp(agentName) }).click()
  await expect(page).toHaveURL(agentUrl)
  await page
    .getByRole("link", { name: "Back to Application", exact: true })
    .click()
  await expect(
    page.getByRole("tab", { name: "Agents", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  expect(pageErrors).toEqual([])
})
