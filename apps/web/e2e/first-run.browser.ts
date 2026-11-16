import { expect, test } from "@playwright/test"
import { z } from "zod"

import { chooseOption } from "./choose-option"

// FIRST_RUN_EMAIL must be a verified account with no workflow and no model key yet: the starter
// button only shows on an empty workspace, and sign-up emails cannot be read from a test.
const environment = z
  .object({
    FIRST_RUN_EMAIL: z.email(),
    FIRST_RUN_PASSWORD: z.string().min(1),
  })
  .parse(process.env)

const origin = new URL(process.env.AGENT_UI_BASE_URL ?? "http://localhost:3001")
  .origin

test("sign-up asks to verify the email address", async ({ page }) => {
  await page.goto("/sign-up")
  await page.waitForLoadState("networkidle")
  await page.getByLabel("Name", { exact: true }).fill("First Run")
  await page
    .getByLabel("Email", { exact: true })
    .fill(`first-run-${Date.now()}@example.test`)
  await page.getByLabel("Password", { exact: true }).fill("FirstRun123!")
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await expect(page).toHaveURL(/\/verify-email/)
})

test("a new account reaches a traced run from its personal workspace", async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  const login = await page.request.post("/v1/auth/sign-in/email", {
    headers: { origin },
    data: {
      email: environment.FIRST_RUN_EMAIL,
      password: environment.FIRST_RUN_PASSWORD,
    },
  })
  expect(login.ok()).toBe(true)

  await page.goto("/")
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/)
  await page.waitForLoadState("networkidle")
  const workspaceHome = page.url()

  await page
    .getByRole("button", { name: "Starter workflow", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Add a model to continue" })
  await expect(dialog).toBeVisible()
  await chooseOption({
    page,
    control: dialog.getByLabel("Model", { exact: true }),
    option: "GPT-5 mini",
  })
  await dialog.getByLabel("OpenAI API key").fill("sk-first-run-test-key")
  await dialog.getByRole("button", { name: "Save model", exact: true }).click()

  await expect(page).toHaveURL(/\/workflows\/[a-f0-9-]+\/builder/)
  const composer = page.getByPlaceholder("Send a message…")
  await composer.fill("Say hello")
  await page.getByRole("button", { name: "Send message", exact: true }).click()

  await expect(page.getByText("Thinking…")).toBeVisible()
  await expect(page.getByText("Thinking…")).toBeHidden({ timeout: 30_000 })

  await page.goto(`${workspaceHome}/executions`)
  await page.getByRole("link", { name: "Chat assistant" }).first().click()
  const trace = page.getByRole("region", {
    name: "Execution trace",
    exact: true,
  })
  await expect(
    trace.getByRole("heading", { name: /Trace.*[1-9]\d* steps?/ })
  ).toBeVisible()
  expect(pageErrors).toEqual([])
})
