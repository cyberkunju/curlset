/**
 * Browser test for the exact reported case: 1,000 examples across 2 categories (500 per class).
 * This is the request that previously failed with raw validation JSON, and the run size that
 * appeared to hang at 500/500.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.resolve('e2e/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const lines = [];
const check = (name, ok, detail = '') => {
  if (ok) lines.push(`PASS  ${name}`);
  else { failures += 1; lines.push(`FAIL  ${name}  ${detail}`); }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
const waitText = (text, timeout = 30000) =>
  page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });

try {
  await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
  await waitText('What do you want to make', 20000);
  await page.getByRole('button', { name: /Generate a dataset/ }).first().click();
  await waitText('Describe what you need', 20000);
  await page.locator('textarea').first().fill(
    "A dataset for identifying whether an English sentence uses “these” correctly: correct usage, incorrect usage",
  );
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await waitText('How many examples?', 20000);

  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  const countInput = page.locator('input[type=number]').first();
  await countInput.fill('1000');
  check('custom count accepts 1,000', (await countInput.inputValue()) === '1000');

  const hint = await page.getByText(/per category/i).first().innerText();
  check('limit hint explains 500 per category', hint.includes('500 per category'), hint);

  const generateButton = page.getByRole('button', { name: /Generate \d+ examples/ });
  check('button shows 1,000', (await generateButton.innerText()).includes('1,000')
    || (await generateButton.innerText()).includes('1000'), await generateButton.innerText());
  await page.screenshot({ path: path.join(SHOTS, '10-large-confirm.png') });

  const started = Date.now();
  await generateButton.click();
  const done = page.getByText(
    /Added \d+ examples|did not pass the quality check|Generation failed|was interrupted|No verification model/i,
  ).first();
  await done.waitFor({ state: 'visible', timeout: 240000 });
  const resultText = await done.innerText();
  const seconds = Math.round((Date.now() - started) / 1000);
  await page.screenshot({ path: path.join(SHOTS, '11-large-result.png') });

  check('1,000-example run reaches a result screen', true, `${seconds}s`);
  check('run finished with a real outcome',
    /Added \d+ examples|did not pass the quality check/i.test(resultText), resultText);
  check('no raw validation JSON anywhere',
    !(await page.content()).includes('less_than_equal'), 'validation JSON leaked');
} catch (error) {
  failures += 1;
  lines.push(`FAIL  unexpected exception: ${error?.message || error}`);
  await page.screenshot({ path: path.join(SHOTS, '12-large-failure.png') }).catch(() => {});
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const relevant = consoleErrors.filter((m) => !/favicon|React DevTools|WebSocket/.test(m));
  check('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of lines) console.log(line);
console.log(`\nBROWSER LARGE-RUN E2E: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
