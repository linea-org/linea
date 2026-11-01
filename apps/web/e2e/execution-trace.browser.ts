import { test, expect } from "@playwright/test"
import { z } from "zod"
import { chooseOption } from "./choose-option"
import { signInWorkspace } from "./sign-in-workspace"

const environment = z
  .object({
    AGENT_UI_EMAIL: z.email(),
    AGENT_UI_PASSWORD: z.string().min(1),
    TRACE_UI_WORKSPACE: z.string().min(1),
    TRACE_UI_WORKFLOW_ID: z.uuid(),
    TRACE_UI_FAILED_EXECUTION_ID: z.uuid(),
    TRACE_UI_PAUSED_EXECUTION_ID: z.uuid(),
  })
  .parse(process.env)

test("inspects recorded steps, replay lineage, and scoped approvals in a shared trace workspace", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  const workspacePath = `/w/${environment.TRACE_UI_WORKSPACE}`
  const executionPath = `${workspacePath}/executions/${environment.TRACE_UI_FAILED_EXECUTION_ID}`
  await signInWorkspace({
    page,
    email: environment.AGENT_UI_EMAIL,
    password: environment.AGENT_UI_PASSWORD,
    slug: environment.TRACE_UI_WORKSPACE,
  })
  const publicExecution = await page.request.get(
    `http://localhost:3000/v1/executions/${environment.TRACE_UI_FAILED_EXECUTION_ID}`
  )
  expect(publicExecution.status()).toBe(401)
  await page.goto(executionPath)
  const trace = page.getByRole("region", {
    name: "Execution trace",
    exact: true,
  })
  const inspector = page.getByRole("region", {
    name: "Selected step",
    exact: true,
  })
  await expect(
    inspector.getByRole("heading", { name: "HTTP request", exact: true })
  ).toBeVisible()
  await expect(inspector).toContainText("Upstream rate limit")
  await expect(
    inspector.getByRole("button", { name: "Replay", exact: true })
  ).toBeVisible()
  await expect(inspector).toContainText("Resumed")
  await expect(
    trace.getByRole("heading", { name: /Trace.*3 steps/ })
  ).toBeVisible()
  await trace.getByRole("button", { name: /^View parent step:/ }).click()
  await expect(inspector).toContainText("openai · gpt-5")
  await expect(inspector).toContainText(
    "Fetch the open issues before proposing changes."
  )
  const selectedUrl = page.url()
  expect(selectedUrl).toMatch(/#step-[a-f0-9-]+$/)
  await page.reload()
  await expect(inspector).toContainText("openai · gpt-5")
  await inspector.getByRole("tab", { name: "Raw data", exact: true }).click()
  await expect(
    inspector.getByRole("tabpanel", { name: "Raw data", exact: true })
  ).toContainText('"model": "gpt-5"')
  await inspector.getByRole("tab", { name: "Details", exact: true }).click()
  await chooseOption({
    page,
    control: page.getByLabel("Filter trace status", { exact: true }),
    option: "Failed",
  })
  await expect(
    trace.getByRole("button", { name: /succeeded · attempt/ })
  ).toHaveCount(0)
  await expect(inspector).toContainText("Upstream rate limit")
  await inspector.getByRole("button", { name: "Replay", exact: true }).click()
  await inspector.getByRole("textbox").fill("[]")
  await inspector
    .getByRole("button", { name: "Run replay", exact: true })
    .click()
  await expect(
    inspector.getByText("Enter a JSON object", { exact: true })
  ).toBeVisible()
  await inspector.getByRole("button", { name: "Cancel", exact: true }).click()
  await chooseOption({
    page,
    control: page.getByLabel("Filter trace status", { exact: true }),
    option: "All statuses",
  })
  await trace.getByRole("button", { name: /Replay of HTTP request/ }).click()
  await expect(
    inspector.getByRole("button", { name: "Replay", exact: true })
  ).toHaveCount(0)
  await trace
    .getByRole("button", { name: "View original step", exact: true })
    .click()
  await expect(inspector).toContainText("Upstream rate limit")
  await page
    .getByLabel("Search trace steps", { exact: true })
    .fill("does-not-exist")
  await expect(
    trace.getByText("No matching steps.", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Search trace steps", { exact: true }).fill("")
  await expect(inspector).toContainText("Upstream rate limit")
  await page.screenshot({
    path: testInfo.outputPath("execution-trace.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: testInfo.outputPath("execution-trace-dark.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("execution-trace-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto(`${executionPath}#step-00000000-0000-4000-8000-000000000000`)
  await expect(
    trace.getByText("This step is not available in this execution.", {
      exact: true,
    })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Clear step selection", exact: true })
    .click()
  await expect(inspector).toContainText("Upstream rate limit")
  const pausedPath = `${workspacePath}/executions/${environment.TRACE_UI_PAUSED_EXECUTION_ID}`
  await page.goto(pausedPath)
  await page.getByRole("link", { name: "View approvals", exact: true }).click()
  await expect(page).toHaveURL(
    new RegExp(
      `approvals\\?executionId=${environment.TRACE_UI_PAUSED_EXECUTION_ID}$`
    )
  )
  await expect(
    page.getByText("Trace review checkpoint", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Unrelated checkpoint", { exact: true })
  ).not.toBeVisible()
  await page
    .getByRole("link", { name: "Back to Execution", exact: true })
    .click()
  await expect(page).toHaveURL(new URL(pausedPath, page.url()).href)
  await expect(inspector).toContainText(
    "A reviewer should check the proposed action."
  )
  let refreshUnavailable = true
  await page.route("**/_serverFn/**", async (route) => {
    if (
      route.request().method() === "GET" &&
      route
        .request()
        .url()
        .includes(environment.TRACE_UI_PAUSED_EXECUTION_ID) &&
      refreshUnavailable
    ) {
      await route.abort("connectionfailed")
      return
    }
    await route.continue()
  })
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not refresh this execution" })
  ).toBeVisible({ timeout: 20000 })
  await expect(inspector).toContainText(
    "A reviewer should check the proposed action."
  )
  refreshUnavailable = false
  await page.getByRole("button", { name: "Retry refresh", exact: true }).click()
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not refresh this execution" })
  ).not.toBeVisible()
  await page.unroute("**/_serverFn/**")
  await page.goto(
    `${workspacePath}/workflows/${environment.TRACE_UI_WORKFLOW_ID}/builder`
  )
  await expect(page.locator(".react-flow")).toBeVisible()
  await page
    .getByRole("button", { name: "Open run panel", exact: true })
    .click()
  await page.getByRole("button", { name: /succeeded · attempt 1/ }).click()
  await expect(
    page
      .getByRole("dialog")
      .getByRole("region", { name: "Selected step", exact: true })
  ).toContainText("A reviewer should check the proposed action.")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click()
  await page.getByRole("link", { name: "Open trace", exact: true }).click()
  await expect(page).toHaveURL(new URL(pausedPath, page.url()).href)
  expect(pageErrors).toEqual([])
})
