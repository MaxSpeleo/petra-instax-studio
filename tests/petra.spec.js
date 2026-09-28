const { test, expect } = require('@playwright/test');
const path = require('path');

test('Petra Foto: crea, salva, condivide vuoto, ricarica ed elimina miniature', async ({ page, context }) => {
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

  // Production theme selector must work and persist.
  await expect(page.locator('#themePicker')).toBeVisible();
  await page.locator('#themePicker summary').click();
  await page.locator('.theme-swatch[data-accent="#f2a83b"]').click();
  const accentBefore=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accentBefore).toBe('#f2a83b');

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

  // Production frame catalog: all ten styles must be present and applicable.
  await page.locator('.context-tabs button[data-panel="frame"]').click();
  await expect(page.locator('.frame-option')).toHaveCount(10);
  await page.locator('.frame-option[data-frame="comic"]').click();
  await expect(page.locator('.frame-option[data-frame="comic"]')).toHaveClass(/active/);

  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open', '');
  await expect(page.locator('#statusSub')).toContainText('Salvate 1 / 9');
  await expect(page.locator('#slotNo')).toHaveText('2 / 9');

  // A4 composition must expose exactly nine print slots and the saved first mini.
  await page.locator('#sheetBtn').click();
  await expect(page.locator('#sheetDialog')).toHaveAttribute('open', '');
  await expect(page.locator('.print-slot')).toHaveCount(9);
  const firstPrintImg=page.locator('.print-slot').nth(0).locator('img');
  await expect(firstPrintImg).toBeVisible();
  const printPx=await firstPrintImg.evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
  expect(printPx).toEqual({w:638,h:1016});

  // Shared app: native print handoff must be wired to the browser/system print API.
  await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++}});
  await page.locator('#printA4').click();
  await expect.poll(()=>page.evaluate(()=>window.__printCalls)).toBe(1);

  // Shared app: Save PDF must create a real downloadable PDF.
  await expect.poll(()=>page.evaluate(()=>!!window.jspdf?.jsPDF)).toBe(true);
  const pdfDownloadPromise=page.waitForEvent('download');
  await page.locator('#savePdfA4').click();
  const pdfDownload=await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe('Petra-Foto-A4.pdf');
  const pdfPath=await pdfDownload.path();
  const fs=require('fs');
  expect(fs.readFileSync(pdfPath).subarray(0,5).toString()).toBe('%PDF-');

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

  // Permanent share link must always create a fresh isolated workspace,
  // even on the same device/browser where the owner already has saved Mini.
  const shared=await context.newPage();
  await shared.goto('http://127.0.0.1:4173/start.html');
  await shared.waitForURL(/\?workspace=/);
  await expect(shared.locator('#statusSub')).toContainText('Salvate 0 / 9');
  await expect(shared.locator('#mainEmpty')).toBeVisible();
  await shared.close();

  // Verify persistence after a full reload.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('#statusSub')).toContainText('Salvate 2 / 9');
  await expect(page.locator('#mainImg')).toBeVisible();
  const accentAfterReload=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accentAfterReload).toBe('#f2a83b');

  // Re-open first mini: caption content and chosen font must survive reload.
  await page.locator('#mainCard').click();
  await expect(page.locator('#directCaptionInput')).toHaveValue('Petra uno');
  await expect(page.locator('#directCaptionInput')).toHaveCSS('font-family', /Georgia/i);
  await page.locator('.context-tabs button[data-panel="frame"]').click();
  await expect(page.locator('.frame-option[data-frame="comic"]')).toHaveClass(/active/);

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

test('Theme preview: isolated, functional and does not alter shared app', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:4173/theme-preview.html?workspace=theme-preview-qa');
  await expect(page.locator('.theme-preview-banner')).toBeVisible();
  await expect(page.locator('.status-title')).toHaveText('Petra Foto');
  await expect(page.locator('#statusSub')).toContainText('Salvate 0 / 9');

  const before=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(before).toBe('#28e0be');
  await page.locator('.theme-swatch[data-accent="#f08aad"]').click();
  const after=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(after).toBe('#f08aad');

  await expect(page.locator('#addPhotoBtn')).toBeVisible();
  await expect(page.locator('#sheetBtn')).toBeVisible();

  // Add one deterministic Mini in the isolated preview.
  const fixture=path.join(__dirname,'fixture.svg');
  let chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#addPhotoBtn').click();
  let chooser=await chooserPromise;
  await chooser.setFiles(fixture);
  await expect(page.locator('#photoEditor')).toHaveAttribute('open','');
  await page.locator('#directCaptionInput').fill('PDF prova');
  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open','');

  // Print must invoke the browser/system print API, which hands off to the phone/PC print service.
  await page.locator('#sheetBtn').click();
  await expect(page.locator('#sheetDialog')).toHaveAttribute('open','');
  await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++}});
  await page.locator('#printA4').click();
  await expect.poll(()=>page.evaluate(()=>window.__printCalls)).toBe(1);

  // PDF must be generated as a real downloadable PDF, independently of printing.
  await expect.poll(()=>page.evaluate(()=>!!window.jspdf?.jsPDF)).toBe(true);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#savePdfA4').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('Petra-Foto-A4.pdf');
  const p=await download.path();
  const fs=require('fs');
  const head=fs.readFileSync(p).subarray(0,5).toString();
  expect(head).toBe('%PDF-');

  expect(errors,errors.join('\n')).toEqual([]);
});


test('Frames preview: applies and persists decorative border without touching production app', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGE: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text())});
  await page.goto('http://127.0.0.1:4173/frames-preview.html?workspace=frames-qa');
  await expect(page.locator('.frames-preview-banner')).toBeVisible();
  await expect(page.locator('#statusSub')).toContainText('Salvate 0 / 9');

  const fixture=path.join(__dirname,'fixture.svg');
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#addPhotoBtn').click();
  const chooser=await chooserPromise;
  await chooser.setFiles(fixture);
  await page.waitForTimeout(500);
  expect(errors,errors.join('\n')).toEqual([]);
  await expect(page.locator('#photoEditor')).toHaveAttribute('open','');

  await page.locator('.context-tabs button[data-panel="frame"]').click();
  await expect(page.locator('.frame-grid')).toBeVisible();
  await page.locator('.frame-option[data-frame="hearts"]').click();
  await expect(page.locator('.frame-option[data-frame="hearts"]')).toHaveClass(/active/);

  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open','');
  await expect(page.locator('#statusSub')).toContainText('Salvate 1 / 9');

  // Border choice must survive reload because it is part of the Mini state.
  await page.reload();
  await page.locator('#mainCard').click();
  await expect(page.locator('#photoEditor')).toHaveAttribute('open','');
  await page.locator('.context-tabs button[data-panel="frame"]').click();
  await expect(page.locator('.frame-option[data-frame="hearts"]')).toHaveClass(/active/);

  // Saved raster with the frame must be present in the A4 sheet.
  await page.locator('#editorClose').click();
  await page.locator('#sheetBtn').click();
  const img=page.locator('.print-slot').nth(0).locator('img');
  await expect(img).toBeVisible();
  const px=await img.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight}));
  expect(px).toEqual({w:638,h:1016});

  expect(errors,errors.join('\n')).toEqual([]);
});


test('Build 38 mobile: five tabs stay visible and photo supports drag + pinch zoom', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGE: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text())});
  await page.goto('http://127.0.0.1:4173/?workspace=gesture-qa');
  await expect(page.locator('#statusSub')).toContainText('Salvate 0 / 9');

  const fixture=path.join(__dirname,'fixture.svg');
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#addPhotoBtn').click();
  const chooser=await chooserPromise;
  await chooser.setFiles(fixture);
  await expect(page.locator('#photoEditor')).toHaveAttribute('open','');

  await expect(page.locator('.context-tabs button')).toHaveCount(5);
  const tabsFit=await page.evaluate(()=>{
    const nav=document.querySelector('.context-tabs').getBoundingClientRect();
    return [...document.querySelectorAll('.context-tabs button')].every(b=>{
      const r=b.getBoundingClientRect();
      return r.left>=nav.left-1 && r.right<=nav.right+1 && r.top>=nav.top-1 && r.bottom<=nav.bottom+1;
    });
  });
  expect(tabsFit).toBe(true);

  const upper=page.locator('.upper-canvas');
  await expect(upper).toBeVisible();
  const box=await upper.boundingBox();
  const cx=box.x+box.width*.5, cy=box.y+box.height*.42;

  // One-finger drag.
  await page.evaluate(({cx,cy})=>{
    const el=document.querySelector('.upper-canvas');
    const fire=(type,id,x,y)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y,isPrimary:true}));
    fire('pointerdown',1,cx,cy);
    fire('pointermove',1,cx+34,cy+22);
    fire('pointerup',1,cx+34,cy+22);
  },{cx,cy});

  // Two-finger pinch out.
  await page.evaluate(({cx,cy})=>{
    const el=document.querySelector('.upper-canvas');
    const fire=(type,id,x,y,primary=false)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y,isPrimary:primary}));
    fire('pointerdown',11,cx-30,cy,true);
    fire('pointerdown',12,cx+30,cy,false);
    fire('pointermove',11,cx-65,cy,true);
    fire('pointermove',12,cx+65,cy,false);
    fire('pointerup',11,cx-65,cy,true);
    fire('pointerup',12,cx+65,cy,false);
  },{cx,cy});

  const zoom=Number(await page.locator('#zoomPhoto').inputValue());
  expect(zoom).toBeGreaterThan(1.2);

  await page.locator('#saveEditor').click();
  await expect(page.locator('#photoEditor')).not.toHaveAttribute('open','');

  const state=await page.evaluate(async()=>{
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('petra-instax-studio-v2-gesture-qa');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    return await new Promise((res,rej)=>{const tx=db.transaction('slots','readonly');const r=tx.objectStore('slots').get(0);r.onsuccess=()=>res(r.result?.state);r.onerror=()=>rej(r.error)});
  });
  const photo=state.objects.find(o=>o.name==='photo');
  expect(photo.scaleX).toBeGreaterThan(0);
  expect(photo.left).not.toBe(270);
  expect(errors,errors.join('\n')).toEqual([]);
});
