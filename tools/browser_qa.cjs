/* Meaningful browser acceptance checks; use a separately installed Playwright. */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const playwrightPath = process.env.MAP2SELECT_PLAYWRIGHT || 'playwright';
const {chromium} = require(playwrightPath);
const baseURL = process.argv[2] || 'http://127.0.0.1:8765/';
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa');
fs.mkdirSync(path.join(output, 'screenshots'), {recursive: true});

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.MAP2SELECT_CHROME || '/opt/google/chrome/chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const report = {url: baseURL, failures: [], consoleErrors: [], pageErrors: [], requestsFailed: [], checks: []};
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.on('pageerror', err => report.pageErrors.push(err.message));
  page.on('console', msg => {if (msg.type() === 'error') report.consoleErrors.push(msg.text());});
  page.on('response', response => {if (response.status() >= 400) report.requestsFailed.push({url: response.url(), status: response.status()});});
  page.on('requestfailed', request => report.requestsFailed.push({url: request.url(), error: request.failure()?.errorText}));

  async function check(name, callback) {
    try {await callback(); report.checks.push({name, passed: true});}
    catch (err) {report.checks.push({name, passed: false, message: err.message}); report.failures.push(name);}
  }

  try {
    await page.goto(baseURL, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => document.querySelector('#token-explorer')?.getAttribute('aria-busy') === 'false', {timeout: 25000});
    await check('Real frame image renders in both canvases', async () => {
      const canvases = await page.locator('.comparison-stage canvas').evaluateAll(nodes => nodes.map(node => {
        const p = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
        let variation = 0;
        for (let i = 4; i < p.length; i += 164) if (p[i] !== p[0] || p[i + 1] !== p[1]) variation++;
        return {width: node.width, height: node.height, variation};
      }));
      assert.equal(canvases.length, 2);
      assert(canvases.every(c => c.width >= 448 && c.height > 0 && c.variation > 100));
    });
    await check('DriveLM retained counts reflect the actual same budget', async () => {
      assert.match(await page.locator('#baseline-count').innerText(), /426/);
      assert.match(await page.locator('#ours-count').innerText(), /426/);
      assert.equal(await page.locator('#sequence-select option').count(), 2);
      assert.equal(await page.locator('#frame-slider').getAttribute('max'), '63');
    });
    await check('Next, previous, and direct frame scrubbing', async () => {
      await page.locator('#next-frame').click();
      assert.equal(await page.locator('#frame-slider').inputValue(), '1');
      await page.locator('#previous-frame').click();
      assert.equal(await page.locator('#frame-slider').inputValue(), '0');
      await page.locator('#frame-slider').fill('31');
      assert.match(await page.locator('#frame-counter').innerText(), /32/);
    });
    await check('Original and difference views, grid, and opacity work', async () => {
      for (const view of ['raw', 'difference', 'selected']) {
        await page.locator(`[data-view="${view}"]`).click();
        assert.equal(await page.locator(`[data-view="${view}"]`).getAttribute('aria-pressed'), 'true');
      }
      await page.locator('#show-grid').check();
      assert(await page.locator('#show-grid').isChecked());
      await page.locator('#overlay-opacity').fill('70');
      assert.equal(await page.locator('#overlay-opacity').inputValue(), '70');
      await page.locator('#show-grid').uncheck();
      await page.locator('#overlay-opacity').fill('45');
    });
    await check('Collection switching updates frames', async () => {
      const values = await page.locator('#sequence-select option').evaluateAll(nodes => nodes.map(n => n.value));
      await page.locator('#sequence-select').selectOption(values[1]);
      assert.equal(await page.locator('#frame-slider').inputValue(), '0');
      assert.equal(await page.locator('#frame-slider').getAttribute('max'), '63');
      await page.locator('#sequence-select').selectOption(values[0]);
    });
    await check('Displayed overlap is computed from actual saved token IDs', async () => {
      const response = await context.request.get(new URL('assets/data/demo.json', baseURL).href);
      const data = await response.json();
      const frame = data.datasets.find(d => d.id === 'drivelm').sequences[0].frames[0];
      const baseline = new Set(frame.selection['10'].baseline.indices);
      const ours = frame.selection['10'].ours.indices;
      const shared = ours.filter(id => baseline.has(id)).length;
      assert.equal(Number(await page.locator('#shared-stat').innerText()), shared);
      assert.equal(Number(await page.locator('#unique-stat').innerText()), ours.length - shared);
    });
    await check('Keyboard controls and wraparound boundaries', async () => {
      await page.locator('#frame-slider').fill('0');
      await page.locator('#token-explorer').focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#frame-slider').inputValue(), '63');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#frame-slider').inputValue(), '0');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#frame-slider').inputValue(), '1');
      await page.locator('#frame-slider').fill('0');
    });
    await check('Camera allocation displays real six-view counts', async () => {
      await page.locator('#allocation-details summary').click();
      assert.equal(await page.locator('#camera-allocation .camera-budget').count(), 6);
      const baseline = await page.locator('#camera-allocation .baseline-bar').evaluateAll(nodes => nodes.map(n => Number(n.textContent)));
      const ours = await page.locator('#camera-allocation .ours-bar').evaluateAll(nodes => nodes.map(n => Number(n.textContent)));
      assert.equal(baseline.reduce((a, b) => a + b, 0), 426);
      assert.equal(ours.reduce((a, b) => a + b, 0), 426);
      assert(baseline.every(count => count === 71));
      assert(new Set(ours).size > 1);
      await page.locator('#allocation-details summary').click();
    });
    await check('Hover shows the token ID at the actual grid coordinate', async () => {
      await page.waitForFunction(() => document.querySelector('#token-explorer').getAttribute('aria-busy') === 'false');
      const rect = await page.locator('#ours-canvas').boundingBox();
      const x = rect.x + rect.width * (320 + (320 / 27) * 0.5) / 960;
      const y = rect.y + rect.height * (20 + (180 / 27) * 0.5) / 400;
      await page.mouse.move(x, y);
      assert.match(await page.locator('#ours-tooltip').innerText(), /Token 0\b/);
      await page.mouse.move(0, 0);
    });
    await check('DriveLMM-o1 switches to real 25 / 256 selections', async () => {
      await page.getByRole('tab', {name: 'DriveLMM-o1'}).click();
      await page.waitForFunction(() => document.querySelector('#ours-count')?.textContent.includes('25'));
      const label = await page.locator('#baseline-label').innerText();
      assert.match(label, /Prune2Drive/i);
      assert.match(label, /strict/i);
      assert.match(await page.locator('#baseline-count').innerText(), /25\s*\/\s*256/);
      assert.match(await page.locator('#ours-count').innerText(), /25\s*\/\s*256/);
      assert.equal(await page.locator('#sequence-select option').count(), 2);
      assert.match(await page.locator('#retained-stat').innerText(), /9\.77%/);
    });
    await check('Explicit play/pause advances then stops', async () => {
      await page.locator('#frame-slider').fill('0');
      await page.locator('#play-button').click();
      await page.waitForTimeout(1300);
      assert.notEqual(await page.locator('#frame-slider').inputValue(), '0');
      await page.locator('#play-button').click();
      const stopped = await page.locator('#frame-slider').inputValue();
      await page.waitForTimeout(850);
      assert.equal(await page.locator('#frame-slider').inputValue(), stopped);
    });
    await page.getByRole('tab', {name: 'DriveLM', exact: true}).click();
    await page.locator('#frame-slider').fill('0');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: path.join(output, 'screenshots', 'desktop.png'), fullPage: true});
    await page.locator('#token-explorer').screenshot({path: path.join(output, 'screenshots', 'explorer-drivelm.png')});
    await page.getByRole('tab', {name: 'DriveLMM-o1'}).click();
    await page.locator('#token-explorer').screenshot({path: path.join(output, 'screenshots', 'explorer-drivelmm.png')});
    await check('Desktop page has no horizontal overflow', async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    await check('Four actual clip previews and selection downloads', async () => {
      const gallery = page.locator('#clip-gallery');
      assert.equal(await gallery.locator('img').count(), 4);
      const downloadLinks = await gallery.locator('a[download]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
      assert(downloadLinks.filter(url => url?.endsWith('.gif')).length === 4);
      for (const url of downloadLinks) {
        const response = await context.request.get(new URL(url, baseURL).href);
        assert.equal(response.status(), 200);
      }
    });
    await check('Gallery filtering, animated WebP, and opening a collection', async () => {
      await page.locator('[data-gallery="drivelmm"]').click();
      assert.equal(await page.locator('#clip-gallery .clip-card').count(), 2);
      const play = page.locator('#clip-gallery .clip-play').first();
      await play.click();
      assert.equal(await play.getAttribute('aria-pressed'), 'true');
      await page.waitForFunction(() => {
        const image = document.querySelector('#clip-gallery img');
        return image.src.endsWith('comparison.webp') && image.complete && image.naturalWidth > 0;
      });
      await play.click();
      assert.equal(await play.getAttribute('aria-pressed'), 'false');
      await page.locator('#clip-gallery .clip-actions button').nth(1).click();
      assert.equal(await page.locator('#sequence-select').inputValue(), 'collection-2');
      assert.match(await page.locator('#ours-count').innerText(), /25\s*\/\s*256/);
      await page.locator('[data-gallery="all"]').click();
      assert.equal(await page.locator('#clip-gallery .clip-card').count(), 4);
    });
    await check('Result tables show supported values and citation can be copied', async () => {
      const results = await page.locator('#results-content').innerText();
      for (const value of ['59.166', '57.088', '58.272', '74.370', '72.588', '73.018']) assert(results.includes(value));
      await page.locator('#copy-citation').click();
      assert.match(await page.locator('#copy-status').innerText(), /copied|selected/i);
    });
    await page.setViewportSize({width: 390, height: 844});
    await page.getByRole('tab', {name: 'DriveLM', exact: true}).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: path.join(output, 'screenshots', 'mobile.png'), fullPage: true});
    await check('Mobile page has no horizontal overflow', async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    await check('Mobile navigation opens and closes after a section link', async () => {
      await page.locator('.menu-toggle').click();
      assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
      await page.locator('#site-nav a[href="#method"]').click();
      assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    });
    await check('Reduced motion does not autoplay the frame collection', async () => {
      assert.equal(await page.locator('#play-button').getAttribute('aria-pressed'), 'false');
    });
    await check('No browser exceptions or unavailable assets', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.requestsFailed, []);
    });
  } catch (err) {
    report.failures.push('Page initialization');
    report.initializationError = err.message;
    await page.screenshot({path: path.join(output, 'screenshots', 'initialization-error.png'), fullPage: true}).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    if (report.failures.length) process.exitCode = 1;
  }
})();
