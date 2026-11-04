/**
 * Browser test for the reported failure: a natural-language *image* request must not silently
 * become a text dataset. Covers the Home dataset-type chooser and the wizard's type selector.
 * Budget: 2 image generations (low quality).
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
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
const waitText = (text, timeout = 30000) =>
  page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });

try {
  // ---------------------------------------------------------------- Home chooser
  await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
  await waitText('What do you want to make', 20000);
  await page.getByRole('button', { name: /New dataset/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/Available now/i).first().waitFor({ state: 'visible', timeout: 20000 });
  await page.screenshot({ path: path.join(SHOTS, '50-dataset-type-chooser.png') });

  for (const label of ['Text', 'Image', 'Object detection', 'Audio', 'Video', 'Tabular', 'Transaction']) {
    const visible = await dialog.getByText(label, { exact: false }).first().isVisible().catch(() => false);
    check(`chooser lists “${label}”`, visible);
  }
  const plannedSection = await dialog.getByText(/Planned — coming later/i).first().isVisible().catch(() => false);
  check('planned types are grouped and marked', plannedSection);
  const availableCount = await dialog.getByText(/Available now/i).count();
  check('available section present', availableCount >= 1);

  // ---------------------------------------------------------------- image type -> wizard
  await dialog.getByText('Image', { exact: false }).first().click();
  const continueButton = dialog.getByRole('button', { name: /Continue to wizard/ });
  check('image type offers the wizard', await continueButton.isVisible());
  await continueButton.click();
  await waitText('Describe what you need', 20000);
  await page.locator('textarea').first().fill(
    'An image classification dataset of bottle photos, classes: good label, misaligned label',
  );
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await waitText('Dataset type', 20000);
  const wizardDialog = page.getByRole('dialog');
  const typeText = await wizardDialog.innerText();
  check('wizard shows and confirms the detected type', /I read this as/i.test(typeText), typeText.slice(0, 160));
  check('image mode is offered for image plans', /Generate \d+ images?/.test(await wizardDialog.innerText()));
  await page.screenshot({ path: path.join(SHOTS, '51-image-plan-confirm.png') });
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- the reported prompt
  await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
  await waitText('What do you want to make', 20000);
  await page.getByRole('button', { name: /Generate a dataset/ }).first().click();
  await waitText('Describe what you need', 20000);
  await page.locator('textarea').first().fill(
    'i need an dataset for bottle labeling. for the manufacturing and to detect the label mistakes.',
  );
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await waitText('Dataset type', 20000);
  const confirmDialog = page.getByRole('dialog');
  const confirmText = await confirmDialog.innerText();
  check('reported prompt is detected as object detection (not text)',
    /I read this as Object detection/i.test(confirmText), confirmText.slice(0, 200));
  check('user is asked to confirm/change the type', /Object detection[\s\S]{0,40}Image|Dataset type/i.test(confirmText));
  await page.screenshot({ path: path.join(SHOTS, '52-bottle-prompt-confirm.png') });

  // generate 2 base images (detection = images without boxes)
  await confirmDialog.getByRole('button', { name: '2', exact: true }).click();
  const generate = confirmDialog.getByRole('button', { name: /Generate 2 images/ });
  check('detection mode offers image generation', await generate.isVisible(), await generate.innerText());
  await generate.click();
  const done = confirmDialog.getByText(/Generated \d+ image\(s\)/i).first();
  await done.waitFor({ state: 'visible', timeout: 600000 });
  const outcome = await done.innerText();
  check('base images generated for detection', /Generated \d+ image/i.test(outcome), outcome);
  check('detection result explains boxes are next', /unannotated base images|draw boxes/i.test(await confirmDialog.innerText()));
  const openBoxes = confirmDialog.getByRole('button', { name: /Open dataset and draw boxes/ });
  check('one-click hand-off to boxing', await openBoxes.isVisible());
  await page.screenshot({ path: path.join(SHOTS, '53-detection-base-images.png') });
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.join(SHOTS, '54-types-failure.png') }).catch(() => {});
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const relevant = consoleErrors.filter((m) => !/favicon|React DevTools|WebSocket/.test(m));
  check('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER DATASET-TYPES E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
