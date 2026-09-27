const { test, expect } = require('@playwright/test');
const path = require('path');

test('Petra Foto: crea, salva, ricarica ed elimina miniature', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto('http://127.0.0.1:4173/?qa=1');
  await expect(page.locator('.status-title')).toHaveText('Petra Foto');

  // Playwright starts this test in a fresh browser context, so storage is clean.
  await page.waitForTimeout(500);
  expect(errors, errors.join('\n')).toEqual([]);
  await expect(page.locator('#statusSub')).toContainText('Salvate 0 / 9');

  const fixture = path.join(__dirname, 'fixture.svg');

  // Mini 1
  let chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#addPhotoBtn').click();
  let chooser = await chooserPromise;
  await chooser.setFiles(fixture);
  await expect(page.locator('#photoEditor')).toHaveAttribute('open', '');
  await expect(page.locator('#directCaptionInput')).toBeVisible();
  await page.locator('#directCaptionInput').fill('Petra uno');
  await page.locator('#fontFamily').selectOption('Georgia');
  await page.locator('#fontSize').fill('46');
  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open', '');
  await expect(page.locator('#statusSub')).toContainText('Salvate 1 / 9');
  await expect(page.locator('#slotNo')).toHaveText('2 / 9');

  // Mini 2
  chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#addPhotoBtn').click();
  chooser = await chooserPromise;
  await chooser.setFiles(fixture);
  await expect(page.locator('#photoEditor')).toHaveAttribute('open', '');
  await page.locator('#directCaptionInput').fill('Petra due');
  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open', '');
  await expect(page.locator('#statusSub')).toContainText('Salvate 2 / 9');

  // Verify persistence after a full reload.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('#statusSub')).toContainText('Salvate 2 / 9');
  await expect(page.locator('#mainImg')).toBeVisible();

  // Re-open first mini and delete it.
  await page.locator('#mainCard').click();
  await expect(page.locator('#photoEditor')).toHaveAttribute('open', '');
  await page.locator('#deleteMini').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open', '');
  await expect(page.locator('#statusSub')).toContainText('Salvate 1 / 9');

  // Deletion must also survive reload.
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('#statusSub')).toContainText('Salvate 1 / 9');
  await expect(page.locator('#mainEmpty')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});