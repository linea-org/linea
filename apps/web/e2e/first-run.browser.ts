import { expect, test } from "@playwright/test"

import { chooseOption } from "./choose-option"
import { ACCEPTED_KEY, MODEL_REPLY, startFirstRunStub } from "./first-run-stub"

// The stack must use the stub: the API with RESEND_BASE_URL=http://localhost:4010 and the execution
// worker with OPENAI_BASE_URL=http://localhost:4010/v1.
const STUB_PORT = 4010

let stub: Awaited<ReturnType<typeof startFirstRunStub>>

test.beforeAll(async () => {
  stub = await startFirstRunStub(STUB_PORT)
})

test.afterAll(() => stub.close())

test("a new account signs up, fixes a rejected key in the builder and reaches a successful run", async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  const email = `first-run-${Date.now()}@example.test`

  await page.goto("/sign-up")
  await page.waitForLoadState("networkidle")
  await page.getByLabel("Name", { exact: true }).fill("First Run")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill("FirstRun123!")
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click()
  await expect(page).toHaveURL(/\/verify-email/)

  await expect.poll(() => stub.verificationLink(email)).toBeDefined()
  await page.goto(stub.verificationLink(email)!)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Confirm email" }).click()
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/)
  await page.waitForLoadState("networkidle")

  await page.getByRole("button", { name: /^Starter workflow/ }).click()
  const setup = page.getByRole("dialog", { name: "Add a model to continue" })
  await chooseOption({
    page,
    control: setup.getByLabel("Model", { exact: true }),
    option: "GPT-5 mini",
  })
  await setup.getByLabel("OpenAI API key").fill("sk-first-run-rejected")
  await setup.getByRole("button", { name: "Save model", exact: true }).click()

  await expect(page).toHaveURL(/\/workflows\/[a-f0-9-]+\/builder/)
  const builder = page.url()
  const composer = page.getByPlaceholder("Send a message…")
  const send = page.getByRole("button", { name: "Send message", exact: true })
  await composer.fill("Say hello")
  await send.click()
  await expect(
    page.getByText("The model provider rejected the API key.")
  ).toBeVisible({ timeout: 30_000 })

  await page.getByRole("button", { name: "Update your key" }).click()
  const key = page.getByRole("dialog", { name: "OpenAI API key" })
  await key.getByLabel("Secret", { exact: true }).fill(ACCEPTED_KEY)
  await key.getByRole("button", { name: "Save key", exact: true }).click()
  await expect(key).toBeHidden()
  expect(page.url()).toBe(builder)

  await expect(composer).toHaveValue("Say hello")
  await send.click()
  await expect(page.getByText(MODEL_REPLY)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("link", { name: "View trace", exact: true }).click()

  await expect(page).toHaveURL(/\/executions\/[a-f0-9-]+$/)
  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible()
  const trace = page.getByRole("region", {
    name: "Execution trace",
    exact: true,
  })
  await expect(trace.getByRole("heading", { name: /3 steps/ })).toBeVisible()
  expect(pageErrors).toEqual([])
})
