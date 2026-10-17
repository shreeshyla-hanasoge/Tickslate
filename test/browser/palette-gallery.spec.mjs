// The gallery's palette switcher (RFC 0003 §13.2): ?palette=<name> is validated
// against the known names, goes on both theme blocks beside the preset, and the
// address follows the radio group like the preset one.
import { test, expect } from '@playwright/test'

const blocks = (page) =>
  page.evaluate(() => [...document.querySelectorAll('#themes > *')].map((b) => [b.dataset.theme, b.dataset.tsPalette || '', getComputedStyle(b).getPropertyValue('--ts-profit').trim().toUpperCase()]))

test('?palette=cvd opens switched, with the radio checked, in both theme blocks, and wins over a preset', async ({ page }) => {
  await page.goto('/widgets.html?palette=cvd&preset=calm')
  await expect(page.getByRole('radio', { name: /cvd/ })).toBeChecked()
  expect(await blocks(page)).toEqual([['light', 'cvd', '#1D4ED8'], ['dark', 'cvd', '#60A5FA']])
})

test('choosing a palette updates the blocks and the address; choosing the default clears both', async ({ page }) => {
  await page.goto('/widgets.html')
  expect(await blocks(page)).toEqual([['light', '', '#0E7A4E'], ['dark', '', '#34D399']])
  await page.getByRole('radio', { name: /red-up/ }).check()
  expect(await blocks(page)).toEqual([['light', 'red-up', '#C0362C'], ['dark', 'red-up', '#FB7185']])
  expect(page.url()).toContain('palette=red-up')
  await page.getByRole('radio', { name: 'Default colours' }).check()
  expect((await blocks(page)).map((b) => b[1])).toEqual(['', ''])
  expect(page.url()).not.toContain('palette')
})

test('an unknown name falls back to the default colours', async ({ page }) => {
  await page.goto('/widgets.html?palette=nope')
  expect((await blocks(page)).map((b) => b[1])).toEqual(['', ''])
  await expect(page.getByRole('radio', { name: 'Default colours' })).toBeChecked()
})

test('the group is labelled', async ({ page }) => {
  await page.goto('/widgets.html')
  await expect(page.getByRole('group', { name: 'Palette' })).toBeVisible()
})
