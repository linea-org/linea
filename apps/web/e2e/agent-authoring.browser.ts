import { test, expect, type Locator } from "@playwright/test"
import { z } from "zod"
import { chooseSidebarPage } from "./choose-sidebar-page"
import { chooseOption } from "./choose-option"
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

async function expandDeploymentSettings(region: Locator) {
  const toggle = region.getByRole("button", {
    name: "Deployment settings",
    exact: true,
  })
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click()
}

test("author, publish, and independently deploy immutable Agent versions", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  const workspaceSlug =
    environment.AGENT_UI_APPLICATION_PATH.split("/")[2] ?? ""
  await signInWorkspace({
    page,
    email: environment.AGENT_UI_EMAIL,
    password: environment.AGENT_UI_PASSWORD,
    slug: workspaceSlug,
  })
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.goto(environment.AGENT_UI_APPLICATION_PATH),
  ])
  await page.getByRole("button", { name: "Add Agent", exact: true }).click()
  await expect(
    page.getByRole("combobox", { name: "Application", exact: true })
  ).not.toContainText("Choose an Application")
  const agentName = `GitHub issue analyst ${Date.now()}`
  await page.getByLabel("Agent name", { exact: true }).fill(agentName)
  await page
    .getByRole("button", { name: "Advanced settings", exact: true })
    .click()
  await page
    .getByLabel("Agent identifier", { exact: true })
    .fill(`github-analyst-${Date.now()}`)
  await page
    .getByLabel("Description")
    .fill(
      "Analyze repository issues and propose distinct follow-up issues for review."
    )
  await page
    .getByRole("button", { name: "Continue to configure", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: agentName, exact: true })
  ).toBeVisible()
  const agentUrl = page.url()
  await expect(
    page.getByRole("link", { name: "Workspace executions", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Save new version" })
  ).toBeDisabled()
  await page
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Analyze repository issues. Propose two distinct follow-up issues and respect each reviewer's decision."
    )
  await chooseOption({
    page,
    control: page.getByLabel("Model", { exact: true }),
    option: "gpt-5",
  })
  await page.getByLabel("Maximum iterations").fill("6")
  await expect(
    page.getByRole("heading", { name: "Development", exact: true })
  ).not.toBeVisible()
  await page.getByRole("link", { name: "API Contract", exact: true }).click()
  await page.getByLabel("Input JSON Schema").fill("{")
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(
    page.getByText("Enter valid JSON", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Input JSON Schema").fill('{"type":"invalid"}')
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(page.getByRole("alert")).toContainText("schema is invalid")
  const inputSchema = page.getByLabel("Input JSON Schema")
  const prefix =
    '{"type":"object","description":"say ' + String.fromCodePoint(92)
  const suffix = "hello" + String.fromCodePoint(92) + '" now"}'
  await inputSchema.fill(prefix + suffix)
  await inputSchema.evaluate((element, position) => {
    if (!(element instanceof HTMLTextAreaElement))
      throw new Error("Expected a JSON textarea")
    element.setSelectionRange(position, position)
  }, prefix.length)
  await inputSchema.press('"')
  expect(
    z
      .object({ description: z.string() })
      .parse(JSON.parse(await inputSchema.inputValue())).description
  ).toBe('say "hello" now')
  await inputSchema.fill("")
  await inputSchema.pressSequentially(
    '{"type":"object","properties":{"task":{"type":"string"}},"required":["task"],"additionalProperties":false}'
  )
  const contractDraft = await page.getByLabel("Input JSON Schema").inputValue()
  await page.getByRole("link", { name: "Configuration", exact: true }).click()
  await page.getByRole("link", { name: "API Contract", exact: true }).click()
  await expect(page.getByLabel("Input JSON Schema")).toHaveValue(contractDraft)
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(
    page.getByRole("button", { name: "Revision 1", exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Configuration", exact: true }).click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    /Propose two distinct/
  )
  await chooseOption({
    page,
    control: page.getByLabel("Public Contract revision"),
    option: "Revision 1",
  })
  await page.getByRole("button", { name: "Add tool" }).click()
  await chooseOption({
    page,
    control: page.getByRole("combobox", { name: "Tool", exact: true }),
    option: /^List issues/,
  })
  await page.getByRole("button", { name: "Add tool" }).click()
  await page.getByRole("combobox", { name: "Tool", exact: true }).nth(1).click()
  await expect(
    page.getByRole("option", { name: /^List issues/ })
  ).toBeDisabled()
  await page.getByRole("option", { name: /^Create an issue/ }).click()
  await page.getByRole("button", { name: "Save new version" }).click()
  await expect(
    page.getByRole("link", { name: "Versions", exact: true })
  ).toHaveAttribute("aria-current", "page")
  const development = page.getByRole("region", {
    name: "Development deployment",
    exact: true,
  })
  const production = page.getByRole("region", {
    name: "Production deployment",
    exact: true,
  })
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await expect(
    development.getByRole("button", { name: "Save deployment" })
  ).toBeDisabled()
  await page.getByRole("link", { name: "Versions", exact: true }).click()
  await page
    .getByRole("button", { name: "Inspect definition", exact: true })
    .click()
  await expect(
    page.getByRole("region", { name: "Versions", exact: true })
  ).toContainText("github.issues.create")
  await page
    .getByRole("button", { name: "Publish version 1", exact: true })
    .click()
  await expect(page.getByText("Published", { exact: true })).toBeVisible()
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await chooseOption({
    page,
    control: development.getByLabel("Published version and Contract"),
    option: "Version 1 · Contract revision 1",
  })
  const deploymentToggle = page.getByRole("button", {
    name: "Deployments",
    exact: true,
  })
  await expect(deploymentToggle).toHaveAttribute("aria-expanded", "true")
  const beforeToggle = page.url()
  await deploymentToggle.click()
  await expect(page).toHaveURL(beforeToggle)
  await expect(
    page.getByRole("link", { name: "Production", exact: true })
  ).not.toBeVisible()
  await deploymentToggle.click()
  await expect(page).toHaveURL(beforeToggle)
  await page.getByRole("link", { name: "Production", exact: true }).click()
  await expandDeploymentSettings(production)
  await expect(page).toHaveURL(/environment=production/)
  await expect(
    production.getByText("Not deployed", { exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Development", exact: true }).click()
  await expandDeploymentSettings(development)
  await page.getByRole("link", { name: "Versions", exact: true }).click()
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await expect(
    development.getByLabel("Published version and Contract")
  ).toContainText("Version 1 · Contract revision 1")
  await development.getByRole("button", { name: "Save deployment" }).click()
  await expect(development.getByRole("status")).toHaveText("Deployment saved.")
  await page.getByRole("link", { name: "API Contract", exact: true }).click()
  await page.getByRole("button", { name: "Create Contract revision" }).click()
  await expect(
    page.getByRole("button", { name: "Revision 2", exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Configuration", exact: true }).click()
  await chooseOption({
    page,
    control: page.getByLabel("Public Contract revision"),
    option: "Revision 2",
  })
  await page
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Analyze repository issues. Report partial success honestly when a reviewer rejects a later proposal."
    )
  await page.getByRole("button", { name: "Save new version" }).click()
  await page
    .getByRole("button", { name: "Publish version 2", exact: true })
    .click()
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await page.getByRole("link", { name: "Production", exact: true }).click()
  await expandDeploymentSettings(production)
  await chooseOption({
    page,
    control: production.getByLabel("Published version and Contract"),
    option: "Version 2 · Contract revision 2",
  })
  await production.getByRole("button", { name: "Save deployment" }).click()
  await expect(production.getByRole("status")).toHaveText("Deployment saved.")
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.reload(),
  ])
  await expect(
    production.getByRole("button", { name: "Deployment settings", exact: true })
  ).toHaveAttribute("aria-expanded", "false")
  await expect(production.getByText("Version 2", { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await production.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("deployment-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await expect(
    development.getByLabel("Published version and Contract")
  ).toContainText("Version 1 · Contract revision 1")
  await page.getByRole("link", { name: "Production", exact: true }).click()
  await expandDeploymentSettings(production)
  await expect(
    production.getByLabel("Published version and Contract")
  ).toContainText("Version 2 · Contract revision 2")
  await chooseOption({
    page,
    control: production.getByLabel("Deployment status"),
    option: "Disabled",
  })
  await production.getByRole("button", { name: "Save deployment" }).click()
  await expect(
    production.locator("[data-slot=badge]").filter({ hasText: "Disabled" })
  ).toBeVisible()
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.reload(),
  ])
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await page.getByRole("link", { name: "Production", exact: true }).click()
  await expandDeploymentSettings(production)
  await expect(production.getByLabel("Deployment status")).toContainText(
    /disabled/i
  )
  await page.getByRole("link", { name: "Configuration", exact: true }).click()
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Unsaved instructions")
  await page.getByRole("link", { name: "Versions", exact: true }).click()
  await page.getByRole("button", { name: "Use as new version" }).last().click()
  await expect(page.getByRole("alertdialog")).toBeVisible()
  await page.getByRole("button", { name: "Keep editing", exact: true }).click()
  await page.getByRole("link", { name: "Configuration", exact: true }).click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    "Unsaved instructions"
  )
  await page.getByRole("link", { name: "Versions", exact: true }).click()
  await page.getByRole("button", { name: "Use as new version" }).last().click()
  await page
    .getByRole("button", { name: "Replace changes", exact: true })
    .click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    /Propose two distinct/
  )
  await expect(page.getByLabel("Public Contract revision")).toContainText(
    "Revision 1"
  )
  await page.getByRole("link", { name: "Versions", exact: true }).click()
  await page.getByRole("button", { name: "Use as new version" }).first().click()
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    /Report partial success/
  )
  const editorWidth = await page
    .getByRole("region", { name: "Configuration", exact: true })
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
  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .click()
  await page.getByRole("link", { name: "API Contract", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("region", { name: "API Contract", exact: true })
  ).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.goto(environment.AGENT_UI_APPLICATION_PATH),
  ])
  await page.getByRole("link", { name: new RegExp(agentName) }).click()
  await expect(page).toHaveURL(new URL(agentUrl).pathname)
  const agentId = z.uuid().parse(new URL(agentUrl).pathname.split("/").at(-1))
  const archived = await page.request.patch(
    `http://localhost:3000/v1/agents/${agentId}`,
    {
      data: { archived: true },
    }
  )
  expect(archived.ok()).toBe(true)
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/v1/auth/get-session")
    ),
    page.reload(),
  ])
  await expect(page.getByRole("note")).toContainText(
    "This Agent is archived. Configuration is read-only."
  )
  await expect(page.getByLabel("Instructions", { exact: true })).toBeDisabled()
  await chooseSidebarPage({ page, parent: "Deployments", child: "Development" })
  await expandDeploymentSettings(development)
  await expect(
    development.getByLabel("Published version and Contract")
  ).toBeDisabled()
  await chooseOption({
    page,
    control: development.getByLabel("Deployment status"),
    option: "Disabled",
  })
  await development.getByRole("button", { name: "Save deployment" }).click()
  await expect(
    development.locator("[data-slot=badge]").filter({ hasText: "Disabled" })
  ).toBeVisible()
  await expect(
    page.getByRole("banner").getByRole("link", { name: /^Back to/ })
  ).toHaveCount(0)
  const beforeSidebarBack = page.url()
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page).toHaveURL(beforeSidebarBack)
  await page.getByRole("link", { name: "Agents", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "Application Agents", exact: true })
  ).toBeVisible()
  expect(pageErrors).toEqual([])
})
