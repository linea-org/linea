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

test("organizes Workflow creation, navigation, and deployments by Application", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  const workspacePath = environment.AGENT_UI_APPLICATION_PATH.replace(
    /\/applications\/.*$/,
    ""
  )
  const workspaceSlug = workspacePath.replace(/^\/w\//, "")
  const applicationId = z
    .uuid()
    .parse(environment.AGENT_UI_APPLICATION_PATH.split("/").at(-1))
  const workflowName = `Issue analysis ${Date.now()}`
  const secondApplicationName = `Support ${Date.now()}`
  await page.goto("/sign-in")
  await page
    .getByLabel("Email", { exact: true })
    .fill(environment.AGENT_UI_EMAIL)
  await page
    .getByLabel("Password", { exact: true })
    .fill(environment.AGENT_UI_PASSWORD)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).not.toHaveURL(/\/sign-in/)
  await page.getByRole("button", { name: new RegExp(workspaceSlug) }).click()
  await expect(page).toHaveURL(/\/w\//)
  await page.goto(environment.AGENT_UI_APPLICATION_PATH)
  await expect(page.getByRole("tab", { name: /^Workflows/ })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await expect(
    page.getByRole("heading", { name: "Development", exact: true })
  ).not.toBeVisible()
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
      "Analyze incoming GitHub issues and route proposed follow-up work for review."
    )
  await dialog
    .getByRole("button", { name: "Create Workflow", exact: true })
    .click()
  await expect(page).toHaveURL(/\/workflows\/[a-f0-9-]+\/builder$/)
  await expect(page.locator(".react-flow")).toBeVisible()
  await page.getByRole("link", { name: "Application", exact: true }).click()
  await expect(page).toHaveURL(
    `${new URL(environment.AGENT_UI_APPLICATION_PATH, page.url()).href}?view=workflows`
  )
  await expect(
    page.getByRole("heading", { name: workflowName, exact: true })
  ).toBeVisible()
  const workflows = page.getByRole("region", { name: "Application Workflows" })
  await workflows.getByRole("link", { name: new RegExp(workflowName) }).click()
  await expect(
    page.getByRole("heading", { name: workflowName, exact: true })
  ).toBeVisible()
  await page
    .getByRole("link", { name: "Back to Application", exact: true })
    .click()
  await expect(page.getByRole("tab", { name: /^Workflows/ })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await page.getByRole("tab", { name: "Agents", exact: true }).click()
  await expect(page).toHaveURL(/view=agents$/)
  await page.reload()
  await expect(
    page.getByRole("tab", { name: "Agents", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("button", { name: "Create Agent", exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Environments", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Development", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Production", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create Workflow", exact: true })
  ).not.toBeVisible()
  await expect(page.getByLabel("Content retention in days")).not.toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("environments-overview.png"),
    fullPage: true,
    animations: "disabled",
  })
  const development = page.getByRole("region", {
    name: "Development Environment",
    exact: true,
  })
  await development
    .getByRole("button", { name: "Manage Development", exact: true })
    .click()
  let savedRetention = ""
  for (const section of [
    "Deployments",
    "Connections",
    "Secrets",
    "Backend keys",
    "User identity",
    "Settings",
  ]) {
    const sheet = page.getByRole("dialog")
    await sheet.getByLabel("Section", { exact: true }).selectOption(section)
    await expect(
      sheet.getByRole("heading", {
        name: section,
        exact: true,
      })
    ).toBeVisible()
    if (section === "Settings") {
      const retention = sheet.getByLabel("Content retention in days")
      savedRetention = (await retention.inputValue()) === "45" ? "46" : "45"
      await retention.fill(savedRetention)
      await sheet
        .getByRole("button", { name: "Save retention", exact: true })
        .click()
      await expect(sheet.getByRole("status")).toHaveText("Retention saved.")
      await sheet
        .getByRole("button", { name: "Disable Environment", exact: true })
        .click()
      await expect(page.getByRole("alertdialog")).toBeVisible()
      await page.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(page.getByRole("alertdialog")).not.toBeVisible()
    }
    if (section === "User identity") {
      await expect(
        sheet.getByLabel("Identity provider issuer", { exact: true })
      ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath("environment-identity.png"),
        fullPage: true,
        animations: "disabled",
      })
      await page.setViewportSize({ width: 390, height: 844 })
      expect(
        await sheet.evaluate(
          (element) => element.scrollWidth <= element.clientWidth
        )
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath("environment-identity-mobile.png"),
        fullPage: true,
        animations: "disabled",
      })
      await page.setViewportSize({ width: 1440, height: 1100 })
    }
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await development
    .getByRole("button", { name: "Manage Development", exact: true })
    .click()
  await expect(
    page.getByRole("dialog").getByLabel("Content retention in days")
  ).toHaveValue(savedRetention)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click()
  await expect(development.getByText("Enabled", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: /^Workflows/ }).click()
  await expect(workflows).toBeVisible()
  await expect(page.getByRole("tab", { name: /^Workflows/ })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await page.screenshot({
    path: testInfo.outputPath("application-workflows.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: testInfo.outputPath("application-workflows-dark.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("main")).every(
        (main) => main.scrollWidth <= main.clientWidth
      )
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("application-workflows-mobile.png"),
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto(`${workspacePath}/applications`)
  await page
    .getByRole("button", { name: "Create Application", exact: true })
    .click()
  await page.getByLabel("Name", { exact: true }).fill(secondApplicationName)
  await page.getByLabel("Slug", { exact: true }).fill(`support-${Date.now()}`)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create Application", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: secondApplicationName, exact: true })
  ).toBeVisible()
  const secondApplicationId = z
    .uuid()
    .parse(new URL(page.url()).pathname.split("/").at(-1))
  await expect(
    page.getByText("No Workflows in this Application yet.", { exact: false })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: workflowName, exact: true })
  ).not.toBeVisible()
  await page.goto(`${workspacePath}/workflows`)
  await expect(
    page.getByRole("columnheader", { name: "Application", exact: true })
  ).toBeVisible()
  await page
    .getByRole("combobox", { name: "Filter by Application" })
    .selectOption(secondApplicationId)
  await expect(
    page.getByText("No matching workflows", { exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Create workflow", exact: true })
    .click()
  await expect(
    dialog.getByRole("combobox", { name: "Application", exact: true })
  ).toBeDisabled()
  await expect(
    dialog.getByRole("combobox", { name: "Application", exact: true })
  ).toContainText(secondApplicationName)
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page
    .getByRole("combobox", { name: "Filter by Application" })
    .selectOption(applicationId)
  const row = page.getByRole("row").filter({ hasText: workflowName })
  await expect(row).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole("combobox", { name: "Filter by Application" })
  ).toHaveValue(applicationId)
  await row.getByRole("link").last().click()
  await expect(page).toHaveURL(new RegExp(`${applicationId}\\?view=workflows$`))
  await page
    .getByRole("link", { name: "Back to Applications", exact: true })
    .click()
  await expect(page).toHaveURL(
    `${new URL(`${workspacePath}/applications`, page.url()).href}`
  )
  expect(pageErrors).toEqual([])
})
