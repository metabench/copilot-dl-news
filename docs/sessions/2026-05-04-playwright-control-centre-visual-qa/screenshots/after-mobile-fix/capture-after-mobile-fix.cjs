const fs = require('fs');
const path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { try { puppeteer = require('puppeteer-core'); } catch (e2) { console.error('Puppeteer is not installed or resolvable.'); process.exit(2); } }
const outDir = path.resolve('docs/sessions/2026-05-04-playwright-control-centre-visual-qa/screenshots/after-mobile-fix');
fs.mkdirSync(outDir, { recursive: true });
const base = 'http://localhost:3097';
const desktopRoutes = ['home','cloud-crawl','downloads','screenshot-review','search-explorer'];
const mobileRoutes = ['home','cloud-crawl','downloads','screenshot-review'];
const entries = [];
function safeName(label, app) { return `${label}-${app}.png`; }
async function capture(page, label, app, viewport) {
  const url = `${base}/?app=${encodeURIComponent(app)}`;
  const consoleErrors = [];
  const failedRequests = [];
  const httpErrors = [];
  const onConsole = msg => { if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), location: msg.location() }); };
  const onRequestFailed = req => failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure() && req.failure().errorText });
  const onResponse = res => { if (res.status() >= 400) httpErrors.push({ url: res.url(), status: res.status(), statusText: res.statusText() }); };
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  await page.setViewport(viewport);
  let navigationError = null;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForTimeout(1200);
  } catch (e) { navigationError = e.message; }
  const metrics = await page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;
    const main = document.querySelector('main');
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 20).map(el => ({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180) }));
    const textSnippets = Array.from(document.querySelectorAll('p,li,button,a,span')).map(el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40).map(t => t.slice(0, 180));
    const maxRight = Math.max(...Array.from(document.querySelectorAll('body *')).map(el => { const r = el.getBoundingClientRect(); return Number.isFinite(r.right) ? r.right : 0; }), doc.scrollWidth, body ? body.scrollWidth : 0);
    return {
      title: document.title,
      url: location.href,
      headings,
      textSnippets,
      viewport: { width: innerWidth, height: innerHeight },
      body: body ? { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight } : null,
      main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, rect: (() => { const r = main.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; })() } : null,
      documentElement: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, scrollHeight: doc.scrollHeight, clientHeight: doc.clientHeight },
      horizontalOverflow: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, Math.ceil(maxRight)) > innerWidth + 1,
      overflowAmount: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, Math.ceil(maxRight)) - innerWidth
    };
  }).catch(e => ({ evaluationError: e.message }));
  const screenshot = safeName(label, app);
  try { await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true }); } catch (e) { consoleErrors.push({ text: `screenshot failed: ${e.message}` }); }
  page.off('console', onConsole);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);
  entries.push({ label, app, url, screenshot, navigationError, ...metrics, consoleErrors, failedRequests, httpErrors });
}
(async () => {
  const launchOptions = { headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  for (const app of desktopRoutes) await capture(page, 'desktop', app, { width: 1440, height: 1100, deviceScaleFactor: 1, isMobile: false });
  for (const app of mobileRoutes) await capture(page, 'mobile', app, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await browser.close();
  const summary = entries.map(e => ({ label:e.label, app:e.app, screenshot:e.screenshot, title:e.title, heading:(e.headings||[])[0]?.text, horizontalOverflow:e.horizontalOverflow, overflowAmount:e.overflowAmount, consoleErrors:(e.consoleErrors||[]).length, failedRequests:(e.failedRequests||[]).length, httpErrors:(e.httpErrors||[]).length, navigationError:e.navigationError || null }));
  const report = { generatedAt: new Date().toISOString(), baseUrl: base, outputDir: outDir, entries, summary };
  fs.writeFileSync(path.join(outDir, 'visual-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outputDir: outDir, summary }, null, 2));
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
