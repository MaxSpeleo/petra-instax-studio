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
  await page.locator('.context-tabs button[data-panel="text"]').click();
  await page.locator('#fontFamily').selectOption('Georgia');
  await page.locator('#fontSize').fill('46');
  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open', '');
  await expect(page.locator('#statusSub')).toContainText('Salvate 1 / 9');
  await expect(page.locator('#slotNo')).toHaveText('2 / 9');

  // A4 composition must expose exactly nine print slots and the saved first mini.
  await page.locator('#sheetBtn').click();
  await expect(page.locator('#sheetDialog')).toHaveAttribute('open', '');
  await expect(page.locator('.print-slot')).toHaveCount(9);
  await expect(page.locator('.print-slot').nth(0).locator('img')).toBeVisible();
  await page.locator('#sheetClose').click();

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

  // Re-open first mini: caption content and chosen font must survive reload.
  await page.locator('#mainCard').click();
  await expect(page.locator('#directCaptionInput')).toHaveValue('Petra uno');
  await expect(page.locator('#directCaptionInput')).toHaveCSS('font-family', /Georgia/i);

  // Core editor controls must all fit in the mobile viewport without page scrolling.
  const fit = await page.evaluate(() => {
    const shell = document.querySelector('.editor-shell').getBoundingClientRect();
    const save = document.querySelector('#saveEditor').getBoundingClientRect();
    const del = document.querySelector('#deleteMini').getBoundingClientRect();
    return {
      shellTop: shell.top, shellBottom: shell.bottom,
      saveBottom: save.bottom, deleteBottom: del.bottom,
      innerHeight: window.innerHeight
    };
  });
  expect(fit.shellTop).toBeGreaterThanOrEqual(0);
  expect(fit.shellBottom).toBeLessThanOrEqual(fit.innerHeight + 1);
  expect(fit.saveBottom).toBeLessThanOrEqual(fit.innerHeight + 1);
  expect(fit.deleteBottom).toBeLessThanOrEqual(fit.innerHeight + 1);

  // Delete the first mini.

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