/**
 * Real browser end-to-end smoke test (Chromium via Playwright).
 *
 * Drives the actual UI — no API-level shortcuts — and fails on:
 *   * any assertion mismatch,
 *   * any uncaught page error,
 *   * any console error,
 *   * a generation run that never reaches its result screen (the "stuck at 500/500" bug).
 *
 * Usage: node e2e/ui-smoke.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.resolve('e2e/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let failures = 0;

function check(name, condition, detail = '') {
  if (condition) {
    results.push(`PASS  ${name}`);
  } else {
    failures += 1;
    results.push(`FAIL  ${name}  ${detail}`);
  }
}

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error)));

const shot = async (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
const waitText = (text, timeout = 30000) =>
  page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });

try {
  // ---------------------------------------------------------------- home
  await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
  await waitText('What do you want to make', 20000);
  await shot('01-home.png');
  check('home renders two doors',
    await page.getByText('Generate a dataset', { exact: false }).first().isVisible()
    && await page.getByText('Label my data', { exact: false }).first().isVisible());

  // ---------------------------------------------------------------- generation wizard
  await page.getByRole('button', { name: /Generate a dataset/ }).first().click();
  await waitText('Describe what you need', 20000);
  await page.locator('textarea').first().fill(
    'Support tickets labelled by intent with 50 examples: billing, technical_support',
  );
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await waitText('How many examples?', 20000);
  await shot('02-confirm.png');
  check('confirm step shows the count question',
    await page.getByText('How many examples?', { exact: false }).first().isVisible());

  // custom count path (the screenshot bug): choose Custom and type a value
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  const countInput = page.locator('input[type=number]').first();
  await countInput.fill('50');
  check('custom count accepts 50', (await countInput.inputValue()) === '50');

  const generateButton = page.getByRole('button', { name: /Generate \d+ examples/ });
  check('generate button reflects the count',
    (await generateButton.innerText()).includes('50'), await generateButton.innerText());
  await generateButton.click();

  // ---------------------------------------------------------------- stuck-job regression
  const started = Date.now();
  const doneLocator = page.getByText(/Added \d+ examples|did not pass the quality check|was interrupted|Generation failed|No verification model/i).first();
  await doneLocator.waitFor({ state: 'visible', timeout: 180000 });
  const tookMs = Date.now() - started;
  await shot('03-result.png');
  const resultText = await doneLocator.innerText();
  check('generation reaches a result screen (not stuck)', true, `${Math.round(tookMs / 1000)}s`);
  check('run finished with a real outcome', /Added \d+ examples|did not pass the quality check/i.test(resultText), resultText);
  check('result screen offers a next action',
    await page.getByRole('button', { name: /Open dataset|Close/ }).first().isVisible());

  const stuckBannerVisible = await page.getByText('This run has stopped reporting progress', { exact: false })
    .first().isVisible().catch(() => false);
  check('no false stall banner on a healthy run', stuckBannerVisible === false);

  await page.getByRole('button', { name: 'Close', exact: true }).last().click();

  // ---------------------------------------------------------------- labeling wizard
  await page.getByRole('button', { name: /Label my data/ }).first().click();
  await waitText('Import a file', 20000);
  const csvPath = path.resolve('e2e/labels-sample.csv');
  fs.writeFileSync(csvPath,
    'text,label\n' +
    'I was charged twice for my subscription,billing\n' +
    'The app crashes when I export,technical_support\n' +
    'Please refund my invoice,billing\n' +
    'Uploading a file returns an error,technical_support\n');
  await page.locator('input[type=file]').first().setInputFiles(csvPath);
  await waitText('Detected 4 row', 30000);
  await shot('04-label-bring.png');
  check('file analysis detected rows and classes',
    await page.getByText('Detected 4 row', { exact: false }).first().isVisible());

  await page.getByRole('button', { name: /Import \d+ rows and start/ }).click();
  await waitText('Press 1–9 to label', 40000);
  await shot('05-label-session.png');
  check('labeling session starts', true);

  // ------------------------------------------------ autonomous labelling inside the wizard
  // Scope to the dialog: the Home feed behind the modal also contains "auto-labelled" badges.
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Label automatically', exact: true }).click();
  const autoBadge = dialog.getByText(/auto-labelled \u00b7 \d+ need review/i).first();
  await autoBadge.waitFor({ state: 'visible', timeout: 90000 });
  const summaryText = await autoBadge.innerText();
  check('autonomous labelling completes', /auto-labelled/i.test(summaryText), summaryText);
  await shot('06-auto-label.png');

  // Whatever the models left over is what a human sees; label one if anything remains.
  const remaining = page.getByText(/\d+ example\(s\) need your judgement/i).first();
  const hasRemaining = await remaining.isVisible().catch(() => false);
  if (hasRemaining) {
    const before = await page.getByText(/labelled \d+/).first().innerText();
    await page.keyboard.press('1');
    await page.waitForTimeout(1200);
    const after = await page.getByText(/labelled \d+/).first().innerText();
    check('keyboard labelling still works on the review band', before !== after, `${before} -> ${after}`);
  } else {
    check('all rows were auto-labelled, nothing left for a human', true);
  }
  await shot('07-label-after.png');
} catch (error) {
  failures += 1;
  results.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await shot('99-failure.png').catch(() => {});
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const relevantConsoleErrors = consoleErrors.filter(
    (message) => !/favicon|Download the React DevTools|WebSocket/.test(message),
  );
  check('no console errors', relevantConsoleErrors.length === 0, relevantConsoleErrors.slice(0, 3).join(' | '));

  await browser.close();
}

for (const line of results) console.log(line);
console.log(`\nBROWSER UI E2E: ${results.filter((line) => line.startsWith('PASS')).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
