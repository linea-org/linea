import type { Page } from "@playwright/test"

export async function chooseSidebarPage({
  page,
  parent,
  child,
}: {
  page: Page
  parent: string
  child: string
}) {
  const toggle = page.getByRole("button", { name: parent, exact: true })
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click()
  await page.getByRole("link", { name: child, exact: true }).click()
}
