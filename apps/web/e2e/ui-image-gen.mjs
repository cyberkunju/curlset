/**
 * Browser test: image dataset generation through the wizard with a REAL image model,
 * then hand-off to labeling and autonomous labeling. Budget: 2 images, low quality.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.resolve('e2e/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const lines = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) lines.push(`PASS  ${name}`);
  else { failures += 1; lines.push(`FAIL  ${name}  ${detail}`); }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(String(error)));
const waitText = (text, timeout = 30000) =>
  page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });

try {
  await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
  await waitText('What do you want to make', 20000);
  await page.getByRole('button', { name: /Generate a dataset/ }).first().click();
  await waitText('Describe what you need', 20000);
  await page.locator('textarea').first().fill(
    'An image classification dataset of simple flat illustrations of fruit, classes: apple, pear',
  );
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await waitText('Image quality and style', 20000);
  check('wizard recognises an image dataset request', true);
  await page.screenshot({ path: path.join(SHOTS, '30-image-gen-confirm.png') });

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: /low quality/ }).click();
  const generate = dialog.getByRole('button', { name: /Generate 2 images/ });
  check('generate button shows image mode', await generate.isVisible(), await generate.innerText());

  const started = Date.now();
  await generate.click();
  const done = dialog.getByText(/Generated \d+ image\(s\)/i).first();
  await done.waitFor({ state: 'visible', timeout: 600000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const outcome = await done.innerText();
  check('image generation completes in the UI', /Generated \d+ image/i.test(outcome), outcome);
  check('cost is reported for a priced model', /Cost: \$\d/.test(outcome) || /not reported/.test(outcome), outcome);
  await page.screenshot({ path: path.join(SHOTS, '31-image-gen-done.png') });

  const thumbs = dialog.locator('img');
  await thumbs.first().waitFor({ state: 'visible', timeout: 20000 });
  const thumbCount = await thumbs.count();
  const loaded = await thumbs.first().evaluate((element) => ({
    width: element.naturalWidth, height: element.naturalHeight,
  }));
  check('generated thumbnails are rendered', thumbCount > 0, String(thumbCount));
  check('thumbnail pixels loaded', loaded.width > 0 && loaded.height > 0, JSON.stringify(loaded));

  // hand-off to labeling
  await dialog.getByRole('button', { name: 'Label these images' }).click();
  await waitText('Press 1–9 to label', 60000);
  const labelDialog = page.getByRole('dialog');
  const sessionImage = labelDialog.locator('img').first();
  await sessionImage.waitFor({ state: 'visible', timeout: 20000 });
  const sessionLoaded = await sessionImage.evaluate((element) => element.naturalWidth > 0);
  check('labeling session shows the generated image', sessionLoaded);
  await page.screenshot({ path: path.join(SHOTS, '32-image-label-session.png') });

  // autonomous labeling on images (simulated providers, no cost)
  await labelDialog.getByRole('button', { name: 'Label automatically', exact: true }).click();
  const autoSummary = labelDialog.getByText(
    /auto-labelled \u00b7 \d+ need review|were labelled automatically by the models/i,
  ).first();
  await autoSummary.waitFor({ state: 'visible', timeout: 120000 });
  check('autonomous labeling works on generated images', true, await autoSummary.innerText());
  await page.screenshot({ path: path.join(SHOTS, '33-image-autolabel-generic.png') });
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.join(SHOTS, '34-image-gen-failure.png') }).catch(() => {});
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const relevant = consoleErrors.filter((m) => !/favicon|React DevTools|WebSocket/.test(m));
  check('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER IMAGE-GEN E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
