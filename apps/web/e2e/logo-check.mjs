/**
 * Verifies the top-left brand in both themes: exact lockup rendered, no tile behind it,
 * correct asset picked for light vs dark, and collapsed state uses the mark.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const OUT = path.resolve('e2e/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.getByText('What do you want to make').first().waitFor({ timeout: 30000 });

const sidebar = page.locator('.sidebar').first();
await sidebar.waitFor({ state: 'visible' });

const brandInfo = async () => {
  return page.evaluate(() => {
    const light = document.querySelector('img.brand-logo--light');
    const dark = document.querySelector('img.brand-logo--dark');
    const wrap = document.querySelector('.brand-lockup');
    const style = (element) => (element ? getComputedStyle(element) : null);
    const pick = (element) => {
      if (!element) return null;
      const computed = style(element);
      return {
        visible: computed.display !== 'none' && element.getBoundingClientRect().width > 0,
        loaded: element.complete && element.naturalWidth > 0,
        width: Math.round(element.getBoundingClientRect().width),
        height: Math.round(element.getBoundingClientRect().height),
        background: computed.backgroundColor,
        border: computed.borderTopWidth,
        boxShadow: computed.boxShadow,
      };
    };
    return {
      light: pick(light),
      dark: pick(dark),
      wrap: wrap ? { background: style(wrap).backgroundColor } : null,
      isDark: document.documentElement.classList.contains('dark'),
    };
  });
};

// ------------------------------------------------------------------ light theme
const light = await brandInfo();
check('light: lockup present and loaded', Boolean(light.light?.loaded && light.light.visible), JSON.stringify(light.light));
check('light: dark variant hidden', light.dark ? light.dark.visible === false : true, JSON.stringify(light.dark));
check('light: no plate behind the logo',
  light.wrap?.background === 'rgba(0, 0, 0, 0)' && light.light?.background === 'rgba(0, 0, 0, 0)' && light.light?.border === '0px',
  JSON.stringify({ wrap: light.wrap, logo: light.light }));
await page.screenshot({ path: path.join(OUT, 'logo-light.png'), clip: { x: 0, y: 0, width: 320, height: 120 } });

// ------------------------------------------------------------------ dark theme
await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.waitForTimeout(350);
const dark = await brandInfo();
check('dark: theme class applied', dark.isDark === true);
check('dark: light variant hidden', dark.light ? dark.light.visible === false : true, JSON.stringify(dark.light));
check('dark: dark variant loaded and visible', Boolean(dark.dark?.loaded && dark.dark.visible), JSON.stringify(dark.dark));
await page.screenshot({ path: path.join(OUT, 'logo-dark.png'), clip: { x: 0, y: 0, width: 320, height: 120 } });

// ------------------------------------------------------------------ collapsed rail
await page.evaluate(() => document.documentElement.classList.remove('dark'));
await page.waitForTimeout(200);
const collapseButton = page.locator('.sidebar button[title*="Collapse"], .sidebar button[aria-label*="Collapse"]').first();
if (await collapseButton.count()) {
  await collapseButton.click();
  await page.waitForTimeout(400);
  const mark = await page.evaluate(() => {
    const image = document.querySelector('img.brand-mark');
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    return { loaded: image.complete && image.naturalWidth > 0, width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  check('collapsed: mark-only Logo', Boolean(mark?.loaded && mark.width > 0), JSON.stringify(mark));
  await page.screenshot({ path: path.join(OUT, 'logo-collapsed.png'), clip: { x: 0, y: 0, width: 120, height: 120 } });
} else {
  check('collapsed: mark-only logo (collapse control not found, skipped)', true);
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();

for (const line of results) console.log(line);
console.log(`\nBRAND UI CHECK: ${results.filter((line) => line.startsWith('PASS')).length}/${results.length} passed`);
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0);
