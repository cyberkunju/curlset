/**
 * Browser test: SAM box proposals from the dataset page (real meta-sam, 3 images).
 * Clicks "Propose boxes (AI)", waits for completion, then opens the workbench and checks boxes exist.
 */
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:8000/api/v1';
const DATASET_ID = process.env.DETECTION_DATASET_ID || 'ds_1a1a839965ahvvyhe';

const lines = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) lines.push(`PASS  ${name}`);
  else { failures += 1; lines.push(`FAIL  ${name}  ${detail}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/#dataset/${DATASET_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Object Detection/i).first().waitFor({ state: 'visible', timeout: 30000 });

  const button = page.getByRole('button', { name: 'Propose boxes (AI)' });
  await button.waitFor({ state: 'visible', timeout: 20000 });
  check('propose-boxes action is offered for detection datasets', true);
  await button.click();

  const summary = page.getByText(/Proposed \d+ box\(es\)/i).first();
  await summary.waitFor({ state: 'visible', timeout: 600000 });
  const text = await summary.innerText();
  check('SAM proposals complete in the UI', /Proposed \d+ box\(es\)/.test(text), text);
  await page.screenshot({ path: path.resolve('e2e/screenshots/70-proposals-done.png') });

  const queue = await (await fetch(`${API}/datasets/${DATASET_ID}/queue?limit=10`)).json();
  const withBoxes = (queue.items || []).filter(
    (item) => Array.isArray(item?.annotation_payload?.boxes) && item.annotation_payload.boxes.length > 0,
  );
  check('boxes persisted as pending-review annotations', withBoxes.length > 0, JSON.stringify(withBoxes.length));
  check('provenance recorded as meta-sam',
    withBoxes.every((item) => item.annotation_payload.proposed_by === 'meta-sam'),
    JSON.stringify(withBoxes.map((item) => item.annotation_payload.proposed_by)));

  // open the workbench: proposed boxes must render on the canvas
  await page.getByRole('button', { name: 'Annotate', exact: true }).first().click();
  const workspace = page.getByText(/Detected Bounding Boxes/i).first();
  await workspace.waitFor({ state: 'visible', timeout: 30000 });
  const counterText = await workspace.innerText();
  check('workbench shows the proposed box count', !/\(0\)/.test(counterText), counterText);
  await page.screenshot({ path: path.resolve('e2e/screenshots/71-proposals-workbench.png') });
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.resolve('e2e/screenshots/72-proposals-failure.png') }).catch(() => {});
} finally {
  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER SAM-PROPOSALS E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
