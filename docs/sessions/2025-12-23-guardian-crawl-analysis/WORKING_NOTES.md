# Working Notes – Guardian Crawl Analysis & ECONNRESET Investigation

- 2025-12-23 — Session created via CLI. Add incremental notes here.

## 2025-12-23: Investigation Summary

### Prior Work (Before Session Created)

**BBC Crawl Success** (baseline verification):
```bash
node tools/dev/mini-crawl.js https://www.bbc.com --max-pages 20
```
- 49 URL events captured
- 25 network fetches, 23 cached (rate-limit), 1 failed (404)
- Timing: Min 85ms, Avg 212ms, P50 158ms, P90 405ms, Max 573ms
- 4.78 MB downloaded

**Guardian Crawl Failure**:
```bash
node tools/dev/mini-crawl.js https://www.theguardian.com --max-pages 20
```
- ECONNRESET after 3 retries
- Only 1 event recorded (the failed root URL)

### Code Analysis

**Current User-Agent** (in `src/crawler/FetchPipeline.js:523`):
```javascript
'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
```
This is a dead giveaway for bot detection.

**Rate Limiting** (in `src/crawler/NewsCrawler.js:208`):
```javascript
rateLimitMs: { type: 'number', default: (opts) => opts.slowMode ? 1000 : 0 }
```
Default is 0 (no delay) unless `slowMode` is enabled.

**Retry Strategy** (in `src/crawler/retry/RetryCoordinator.js:453-470`):
- 3 retries with exponential backoff
- After 3 ECONNRESET in 60s, host is locked out as "connection-unstable"

### Key Files Reviewed

| File | Finding |
|------|---------|
| `src/crawler/FetchPipeline.js` | User-Agent set at line 523, minimal headers |
| `src/crawler/retry/RetryCoordinator.js` | Connection reset handling at line 453 |
| `src/crawler/NetworkRetryPolicy.js` | ECONNRESET is retryable, strategy = 'connection-reset' |
| `tools/dev/mini-crawl.js` | No slow-mode enabled by default |

### Analysis Scripts Created

- `tmp/analyze-bbc-crawl.js` — Comprehensive crawl analysis from DB

### Next Steps

1. ~~Test browser-like User-Agent (quick fix)~~ DONE
2. ~~Design Puppeteer fallback with DB tracking~~ DONE
3. ~~Add `fetchMethod` field to URL events~~ DONE

---

## 2025-12-23: Implementation Complete

### Option A: Browser-like Headers (FAILED)

Updated `src/crawler/FetchPipeline.js:520-540` with full Chrome 120 headers:
```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"...',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Accept': 'text/html,application/xhtml+xml,...',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'Upgrade-Insecure-Requests': '1',
};
```

Also added `--slow` and `--rate-limit` flags to `tools/dev/mini-crawl.js`.

**Test Result**: Still ECONNRESET on Guardian. Reason: **TLS fingerprinting**.

Guardian uses JA3/JA4 TLS fingerprinting to detect bots. The TLS handshake itself reveals the client as Node.js/undici, regardless of HTTP headers.

### Option B: Puppeteer Fallback (SUCCESS)

#### Quick Test
```javascript
// tmp/test-puppeteer-guardian.js
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.goto('https://www.theguardian.com');
// SUCCESS: HTTP 200, 1603 KB content
```

#### Production Module Created: `src/crawler/PuppeteerFetcher.js`

Reusable headless browser fetcher with:
- `fetch(url)` - Single URL fetch
- `fetchMany(urls, options)` - Batch with concurrency control
- EventEmitter interface (progress, complete, error)
- Returns `fetchMethod: 'puppeteer'` in results for DB tracking

#### Crawler Tool Created: `tools/dev/mini-crawl-puppeteer.js`

Standalone Puppeteer-based mini-crawler with:
- BFS crawl with depth limiting
- URL fragment stripping (e.g., `#maincontent`)
- DB event persistence via TaskEventWriter
- Same-domain link extraction
- Rate limiting with `--delay <ms>`

### Final Test Result

```bash
node tools/dev/mini-crawl-puppeteer.js https://www.theguardian.com --max-pages 5 --delay 1000
```

Output:
```
🌐 Puppeteer Crawl starting...
   Start URL: https://www.theguardian.com
   Max pages: 5
   Job ID: puppeteer-crawl-2025-12-23T05-23-56

✅ 200 https://www.theguardian.com/uk (1756ms)
✅ 200 https://www.theguardian.com/artanddesign/2025/dec/22/the-best-art-and-photography-of-2025 (374ms)
✅ 200 https://www.theguardian.com/lifeandstyle/2025/dec/22/... (346ms)
✅ 200 https://www.theguardian.com/commentisfree/2025/dec/22/... (373ms)

✅ Crawl complete
   Duration:   8.4s
   Pages:      5/5
   Bytes:      4240.8 KB
   Method:     puppeteer
```

### DB Verification

```bash
node -e "const db=require('better-sqlite3')('./data/news.db'); 
const row = db.prepare('SELECT payload FROM task_events WHERE task_id=? AND event_type=?')
  .get('puppeteer-crawl-2025-12-23T05-23-56', 'crawl:url:batch'); 
JSON.parse(row.payload).urls.forEach(u => console.log(u.fetchMethod, u.httpStatus, u.url));"
```

Output:
```
puppeteer 200 https://www.theguardian.com
puppeteer 200 https://www.theguardian.com/uk
puppeteer 200 https://www.theguardian.com/artanddesign/2025/dec/22/...
puppeteer 200 https://www.theguardian.com/lifeandstyle/2025/dec/22/...
puppeteer 200 https://www.theguardian.com/commentisfree/2025/dec/22/...
```

All URLs have `fetchMethod: 'puppeteer'` stored for AI agent queries.

### Files Created/Modified

| File | Change |
|------|--------|
| `src/crawler/FetchPipeline.js:520-540` | Added Chrome 120 browser headers |
| `tools/dev/mini-crawl.js` | Added `--slow` and `--rate-limit` flags |
| `src/crawler/PuppeteerFetcher.js` | **NEW** Reusable Puppeteer fetcher module |
| `tools/dev/mini-crawl-puppeteer.js` | **NEW** Puppeteer-based crawler tool |
| `tmp/test-puppeteer-guardian.js` | Quick Puppeteer test script |

### Key Learnings

1. **TLS fingerprinting cannot be bypassed with HTTP headers alone** — Sites like Guardian use JA3/JA4 fingerprinting at the TLS layer, which reveals the client type before any HTTP is exchanged.

2. **Puppeteer uses real Chromium** — The browser's TLS stack produces a genuine Chrome fingerprint, bypassing fingerprint detection.

3. **Rate limiting is essential** — Even with Puppeteer, aggressive crawling triggers bot detection. 1000ms delay works well.

4. **URL fragment normalization matters** — Links like `/uk#maincontent` waste crawl slots. Strip fragments before queuing.

