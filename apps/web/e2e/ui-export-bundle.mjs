/**
 * Browser check: the "Image Bundle (images + labels)" export option is offered for an image dataset.
 * No paid calls.
 */
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const DATASET_ID = process.env.EXPORT_DATASET_ID || 'ds_1a1a835467anv460h';
const lines = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) lines.push(`PASS  ${name}`);
  else { failures += 1; lines.push(`FAIL  ${name}  ${detail}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/#dataset/${DATASET_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/image classification/i).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: /Export Presets/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/Target Training Format/i).first().waitFor({ state: 'visible', timeout: 20000 });
  const body = await dialog.innerText();
  check('export dialog lists the image bundle', /Image Bundle \(images \+ labels\)/.test(body), body.slice(0, 300));
  check('formats count includes the new option', /formats available/.test(body), body.slice(0, 120));
  await page.screenshot({ path: path.resolve('e2e/screenshots/60-export-image-bundle.png') });
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.resolve('e2e/screenshots/61-export-failure.png') }).catch(() => {});
} finally {
  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER EXPORT-BUNDLE E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
