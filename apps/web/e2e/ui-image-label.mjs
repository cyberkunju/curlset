/**
 * Browser test for image classification in Simple Mode (M1).
 *
 * Uploads a ZIP of three PNGs, checks the labeling wizard renders real thumbnails, runs the
 * autonomous engine (which must send image bytes to the provider) and verifies the queue settles.
 * Fails on any console/page error.
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
  await page.getByRole('button', { name: /Label my data/ }).first().click();
  await waitText('Import a file', 20000);

  const zip = path.resolve('e2e/fixtures/images-samples.zip');
  check('image ZIP fixture exists', fs.existsSync(zip), zip);
  await page.locator('input[type=file]').first().setInputFiles(zip);
  await waitText('Images selected', 30000);
  check('wizard recognises image upload', true);

  const dialog = page.getByRole('dialog');
  // The detected card shows: dataset name input, then the classes input.
  const classField = dialog.locator('input:not([type=file])').nth(1);
  const hasClassField = await classField.isVisible().catch(() => false);
  if (hasClassField) await classField.fill('red, green, blue');
  check('classes can be set for images', hasClassField, 'class field not visible');

  await dialog.getByRole('button', { name: /Import images and start/ }).click();
  await waitText('Press 1–9 to label', 60000);
  await page.screenshot({ path: path.join(SHOTS, '20-image-session.png') });

  const image = dialog.locator('img').first();
  await image.waitFor({ state: 'visible', timeout: 20000 });
  const src = await image.getAttribute('src');
  check('image thumbnail is rendered from the asset endpoint', Boolean(src && src.includes('/api/v1/assets/')), String(src));
  const natural = await image.evaluate((element) => ({
    width: element.naturalWidth, height: element.naturalHeight,
  }));
  check('image actually loaded (non-zero pixels)', natural.width > 0 && natural.height > 0, JSON.stringify(natural));

  // autonomous labelling on images: when everything is auto-labelled the wizard moves to the done
  // screen, so accept either the inline badge (partial) or the done-screen summary (complete).
  await dialog.getByRole('button', { name: 'Label automatically', exact: true }).click();
  const summaryLocator = dialog.getByText(
    /auto-labelled \u00b7 \d+ need review|were labelled automatically by the models/i,
  ).first();
  await summaryLocator.waitFor({ state: 'visible', timeout: 120000 });
  const summary = await summaryLocator.innerText();
  check('autonomous image labelling completes', /labelled automatically|auto-labelled/i.test(summary), summary);
  const content = await dialog.innerText();
  check('provenance is stated honestly (machine-labelled, not human)',
    /machine-labelled|origin=ensemble/i.test(content), content.slice(0, 200));
  await page.screenshot({ path: path.join(SHOTS, '21-image-autolabelled.png') });
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.join(SHOTS, '22-image-failure.png') }).catch(() => {});
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const relevant = consoleErrors.filter((m) => !/favicon|React DevTools|WebSocket/.test(m));
  check('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER IMAGE E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
