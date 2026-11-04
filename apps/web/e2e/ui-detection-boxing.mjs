/**
 * Browser test: bounding-box annotation (object detection) on a generated image.
 * Draws a box on the canvas, saves with Enter, and verifies the stored geometry via the API.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:8000/api/v1';
const DATASET_ID = process.env.DETECTION_DATASET_ID || '';
const SHOTS = path.resolve('e2e/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const lines = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) lines.push(`PASS  ${name}`);
  else { failures += 1; lines.push(`FAIL  ${name}  ${detail}`); }
};

if (!DATASET_ID) {
  console.log('FAIL  DETECTION_DATASET_ID is required');
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}/#dataset/${DATASET_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/object detection/i).first().waitFor({ state: 'visible', timeout: 30000 });

  const annotate = page.getByRole('button', { name: 'Annotate', exact: true }).first();
  await annotate.waitFor({ state: 'visible', timeout: 20000 });
  await annotate.click();

  await page.waitForTimeout(1200);
  // The queue renders 24px thumbnails that also use /assets/ URLs: pick the largest image = canvas.
  const candidates = page.locator('img[src*="/assets/"]');
  await candidates.first().waitFor({ state: 'visible', timeout: 30000 });
  let box = null;
  const count = await candidates.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = await candidates.nth(i).boundingBox();
    if (candidate && candidate.width > 200 && (!box || candidate.width > box.width)) box = candidate;
  }
  await page.screenshot({ path: path.join(SHOTS, '40-detection-workspace.png') });
  check('workspace renders the image', Boolean(box && box.width > 100), JSON.stringify(box));

  // draw a box (mouse drag across the image)
  if (box) {
    const startX = box.x + box.width * 0.30;
    const startY = box.y + box.height * 0.30;
    const endX = box.x + box.width * 0.62;
    const endY = box.y + box.height * 0.68;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 5 });
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  const boxCounter = await page.getByText(/Detected Bounding Boxes/i).first().innerText().catch(() => '');
  check('drawing creates a bounding box', /\((\d+)\)/.test(boxCounter) && !/\(0\)/.test(boxCounter), boxCounter);
  await page.screenshot({ path: path.join(SHOTS, '41-detection-box-drawn.png') });

  // save (Enter shortcut in the workbench)
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, '42-detection-saved.png') });

  // verify geometry through the API
  const queueResponse = await fetch(`${API}/datasets/${DATASET_ID}/queue?limit=10`);
  const queue = await queueResponse.json();
  const annotated = (queue.items || []).filter(
    (item) => item.annotation_payload && Array.isArray(item.annotation_payload.boxes)
    && item.annotation_payload.boxes.length > 0,
  );
  check('annotation with boxes was persisted', annotated.length > 0,
    JSON.stringify((queue.items || []).map((item) => item.annotation_payload).slice(0, 2)));
  if (annotated.length > 0) {
    const boxes = annotated[0].annotation_payload.boxes;
    const first = boxes[0] || {};
    const dims = annotated[0].annotation_payload.image_dimensions || {};
    // Canonical storage accepts either w/h or width/height (validated server-side).
    const boxW = Number(first.w ?? first.width);
    const boxH = Number(first.h ?? first.height);
    check('box has intrinsic geometry', boxW > 0 && boxH > 0, JSON.stringify(first));
    check('box lies inside the image', Number(first.x) >= 0 && Number(first.y) >= 0
      && Number(first.x) + boxW <= Number(dims.width || 0) + 1
      && Number(first.y) + boxH <= Number(dims.height || 0) + 1,
      JSON.stringify({ first, dims }));
  }
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.join(SHOTS, '43-detection-failure.png') }).catch(() => {});
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const relevant = consoleErrors.filter((m) => !/favicon|React DevTools|WebSocket/.test(m));
  check('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER BOXING E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
