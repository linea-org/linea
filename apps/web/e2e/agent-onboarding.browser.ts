import { test, expect } from "@playwright/test"
import { z } from "zod"
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

test("adds an Agent with inline Application creation and preserves partial success", async ({
  page,
}, testInfo) => {
  const workspacePath = environment.AGENT_UI_APPLICATION_PATH.replace(
    /\/applications\/.*$/,
    ""
  )
  const workspaceSlug = workspacePath.replace(/^\/w\//, "")
  const agentName = `Backlog analyst ${Date.now()}`
  const applicationName = `Product ${Date.now()}`
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
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
    page.goto(`${workspacePath}/applications`),
  ])
  await page.getByRole("link", { name: "Add Agent", exact: true }).click()
  await expect(
    page.getByRole("heading", {
      name: "Add an Agent to your product",
      exact: true,
    })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Continue to configure", exact: true })
    .click()
  await expect(page.getByText("Enter a name", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Choose an Application", { exact: true }).last()
  ).toBeVisible()
  await page.getByLabel("Agent name", { exact: true }).fill(agentName)
  await chooseOption({
    page,
    control: page.getByLabel("Application", { exact: true }),
    option: "Create an Application…",
  })
  await page
    .getByLabel("Application name", { exact: true })
    .fill(applicationName)
  await page
    .getByRole("button", { name: "Advanced settings", exact: true })
    .click()
  await expect(
    page.getByLabel("Agent identifier", { exact: true })
  ).not.toBeVisible()
  await page
    .getByRole("button", { name: "Advanced settings", exact: true })
    .click()
  await page
    .getByLabel("Description", { exact: true })
    .fill("Triage new issues for the existing product.")
  await expect(
    page.getByLabel("Agent identifier", { exact: true })
  ).toHaveValue(agentName.toLowerCase().replaceAll(" ", "-"))
  await page.screenshot({
    path: testInfo.outputPath("agent-onboarding.png"),
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
    path: testInfo.outputPath("agent-onboarding-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1100 })
  let failNextAgent = true
  let applicationCreates = 0
  await page.route("**/_serverFn/**", async (route) => {
    const request = route.request()
    if (request.method() === "POST") {
      const body = request.postData() ?? ""
      if (body.includes("applicationId") && failNextAgent) {
        failNextAgent = false
        await route.abort("failed")
        return
      }
      if (body.includes(applicationName) && !body.includes("applicationId"))
        applicationCreates += 1
    }
    await route.continue()
  })
  await page
    .getByRole("button", { name: "Continue to configure", exact: true })
    .click()
  await expect(page.getByRole("alert")).toContainText(
    "Your entries have been kept."
  )
  await expect(page.getByRole("status")).toContainText(applicationName)
  await expect(page.getByLabel("Agent name", { exact: true })).toHaveValue(
    agentName
  )
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Triage new issues for the existing product."
  )
  await expect(page.getByLabel("Application", { exact: true })).toContainText(
    applicationName
  )
  await expect(
    page.getByLabel("Application name", { exact: true })
  ).not.toBeVisible()
  await page
    .getByRole("button", { name: "Continue to configure", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: agentName, exact: true })
  ).toBeVisible()
  expect(applicationCreates).toBe(1)
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await page.getByRole("link", { name: "Applications", exact: true }).click()
  await page.getByRole("link", { name: new RegExp(applicationName) }).click()
  await page.getByRole("link", { name: "Agents", exact: true }).click()
  await expect(
    page.getByRole("link", { name: "Agents", exact: true })
  ).toHaveAttribute("aria-current", "page")
  await expect(
    page.getByRole("link", { name: new RegExp(agentName) })
  ).toBeVisible()
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await page.getByRole("link", { name: "Applications", exact: true }).click()
  await expect(
    page.getByRole("link", { name: new RegExp(applicationName) })
  ).toHaveCount(1)
  await page.getByRole("link", { name: "Add Agent", exact: true }).click()
  await page
    .getByLabel("Agent name", { exact: true })
    .fill(`Another analyst ${Date.now()}`)
  await chooseOption({
    page,
    control: page.getByLabel("Application", { exact: true }),
    option: "Create an Application…",
  })
  await page
    .getByLabel("Application name", { exact: true })
    .fill(applicationName)
  await page
    .getByRole("button", { name: "Continue to configure", exact: true })
    .click()
  await expect(
    page.getByText("This identifier is already used.", { exact: false })
  ).toBeVisible()
  await expect(
    page.getByLabel("Application identifier", { exact: true })
  ).toBeVisible()
  expect(pageErrors).toEqual([])
})
