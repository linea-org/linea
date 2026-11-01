import { expect, type Locator, type Page } from "@playwright/test"

export async function chooseOption({
  page,
  control,
  option,
}: {
  page: Page
  control: Locator
  option: string | RegExp
}) {
  await control.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).not.toBeVisible()
}
