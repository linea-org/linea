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

test("keeps sessions available during navigation and recovers from a temporary session service failure", async ({
  page,
}) => {
  const slug = environment.AGENT_UI_APPLICATION_PATH.split("/")[2] ?? ""
  await signInWorkspace({
    page,
    email: environment.AGENT_UI_EMAIL,
    password: environment.AGENT_UI_PASSWORD,
    slug,
  })
  for (let index = 0; index < 105; index += 1) {
    const response = await page.request.get("/v1/auth/get-session")
    expect(response.status(), `session check ${index + 1}`).toBe(200)
    expect(await response.json()).toMatchObject({
      user: { email: environment.AGENT_UI_EMAIL },
    })
    const workspaces = await page.request.get("/v1/auth/organization/list")
    expect(workspaces.status(), `workspace check ${index + 1}`).toBe(200)
    expect(await workspaces.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug })])
    )
  }
  await page.route("**/_serverFn/**", async (route) => {
    const identifier =
      new URL(route.request().url()).pathname.split("/").at(-1) ?? ""
    const serverFunction = Buffer.from(identifier, "base64url").toString()
    if (serverFunction.includes("fetchSessionFn")) {
      await route.fulfill({
        status: 503,
        body: "Session service temporarily unavailable",
      })
      return
    }
    await route.continue()
  })
  await page.getByRole("link", { name: "Applications", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Unable to load workspace", exact: true })
  ).toBeVisible()
  await expect(page).not.toHaveURL(/sign-in/)
  await page.unroute("**/_serverFn/**")
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(
    page.getByRole("textbox", { name: "Search Applications", exact: true })
  ).toBeVisible()
  await expect(page).toHaveURL(`/w/${slug}/applications`)
})
