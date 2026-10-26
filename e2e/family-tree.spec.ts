import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/family-archive.enc.json', (route) =>
    route.fulfill({ status: 404, body: 'No test archive' }))
  await page.route('https://api.github.com/**', (route) => route.abort())
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/')
  const openDialog = page.getByRole('dialog', { name: /Open encrypted archive/ })
  await expect(openDialog).toBeVisible()
  await openDialog.getByRole('button', { name: 'Close' }).click()
  await page.getByLabel('Language').selectOption('en')
})

test('creates and selects a person with a month-only birth date', async ({ page }, testInfo) => {
  const adminButton = page.getByRole('button', { name: 'Admin' })
  await adminButton.click()
  const adminDialog = page.getByRole('dialog', { name: 'Admin' })
  await adminDialog.getByLabel('Local Admin password').fill('moltisantitree')
  await adminDialog.getByRole('button', { name: 'Confirm' }).click()

  await page.getByRole('button', { name: 'Add person' }).click()
  const personDialog = page.getByRole('dialog', { name: 'Add person' })
  await personDialog.getByLabel('First name').fill('Test')
  await personDialog.getByLabel('Last name').fill('Partial')
  await personDialog.getByLabel('Birth date (YYYY-MM-DD)').fill('1990-06')
  await personDialog.getByRole('button', { name: 'Add' }).click()

  const personNode = page.getByRole('button', { name: 'Test Partial, 1990' })
  await expect(personNode).toBeVisible()
  if (testInfo.project.name.startsWith('touch-')) await personNode.tap()
  else await personNode.click()
  await expect(page.getByText('Birthday during June')).toBeVisible()
  await expect(page.getByText('Degree of kinship:')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('keeps keyboard focus inside the Admin dialog and returns it to its opener', async ({ page }) => {
  const adminButton = page.getByRole('button', { name: 'Admin' })
  await adminButton.focus()
  await adminButton.click()
  const dialog = page.getByRole('dialog', { name: 'Admin' })
  const password = dialog.getByLabel('Local Admin password')
  await expect(password).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(adminButton).toBeFocused()
})
