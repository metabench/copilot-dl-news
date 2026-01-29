const https = require('https');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { URL } = require('url');

// Parse arguments
const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const jsonOutput = args.includes('--json');
// Handle --output flag
const outputArgIndex = args.indexOf('--output');
const outputFile = outputArgIndex !== -1 ? args[outputArgIndex + 1] : null;
const seedUrl = args.find(a => a.startsWith('http'));

// Force Puppeteer mode flag (optional manual trigger)
const usePuppeteer = args.includes('--puppeteer');

if (help || !seedUrl) {
    console.log(`
Usage: node tools/dev/hub-discover-indices.js <url> [options]

Crawls a page to find "Hub Hubs" (index pages) and potential Hubs.
Focuses on finding lists of countries/sections (Depth 2 hubs) from a Depth 1 index.

Options:
  --json           Output results as JSON
  --output <file>  Write results to specific JSON file
  --puppeteer      Force Puppeteer usage (default: auto-switch on 401/403/Timeout)
  --help           Show this help message

Example:
  node tools/dev/hub-discover-indices.js https://www.theguardian.com/world/all
`);
    process.exit(0);
}

// Configuration
const CONFIG = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    timeout: 10000
};


// Logging helpers
const LOG_FILE = path.resolve(__dirname, '../../tmp/hub_discover_indices.log');
function appendLog(msg) {
    try {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
    } catch (e) {
        // fallback: print to stderr
        process.stderr.write(`(logfile error) ${e.message}\n`);
    }
}
const log = (msg) => {
    appendLog(msg);
    if (!jsonOutput) console.log(msg);
};
const error = (msg) => {
    appendLog('ERROR: ' + msg);
    if (!jsonOutput) console.error(msg);
};

async function fetchPageHttp(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': CONFIG.userAgent },
            timeout: CONFIG.timeout
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                log(`Redirecting to ${res.headers.location}`);
                resolve(fetchPageHttp(new URL(res.headers.location, url).href));
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Status ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ html: data, url: res.url || url }));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function fetchPagePuppeteer(url) {
    log('🚀 Launching Puppeteer...');
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        throw new Error('Puppeteer dependency not found. Please run npm install.');
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Hide webdriver trace
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Mock plugins to look less headless
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    try {
        await page.setUserAgent(CONFIG.userAgent);
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"'
        });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        const content = await page.content();
        const finalUrl = page.url();
        const title = await page.title();
        log(`✓  Fetched ${content.length} bytes from ${finalUrl} ("${title}")`);
        
        await browser.close();
        
        return { html: content, url: finalUrl };
    } catch (e) {
        await browser.close();
        throw e;
    }
}

async function fetchPage(url) {
    if (usePuppeteer) {
        return fetchPagePuppeteer(url);
    }

    try {
        return await fetchPageHttp(url);
    } catch (e) {
        // Check for block/timeout signals
        if (e.message.includes('Status 401') || 
            e.message.includes('Status 403') || 
            e.message.includes('Status 429') || 
            e.message.includes('Status 500') || 
            e.message.includes('Status 502') || 
            e.message.includes('Status 503') || 
            e.message.includes('Status 504') || 
            e.message.includes('Status 406') || 
            e.message.includes('Timeout') || 
            e.message.includes('ECONNRESET')) {
            
            log(`⚠️  HTTP request failed (${e.message}). Switching to Puppeteer...`);
            return fetchPagePuppeteer(url);
        }
        throw e;
    }
}

function analyzeLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = $('a[href]');
    
    const hubs = new Map(); // url -> { text, count }
    const baseHost = new URL(baseUrl).host;

    links.each((i, el) => {
        try {
            const $a = $(el);
            const href = $a.attr('href');
            if (!href) return;
            
            const url = new URL(href, baseUrl);
            
            // Filter external links (strict host match for now)
            if (url.host !== baseHost) return;

            // Pattern heuristics for "World Hubs"
            // Guardian: /world/france, /world/japan
            // CNN: /africa (depth 1)
            const pathParts = url.pathname.split('/').filter(Boolean);
            
            // Check for potential Hub (Depth 1 or 2 usually)
            if (pathParts.length >= 1 && pathParts.length <= 3) {
                // Heuristic: No numbers (dates) in the last part
                const lastPart = pathParts[pathParts.length - 1];
                
                // Allow index.html, exclude images/docs
                const isFile = lastPart.includes('.') && 
                              !lastPart.endsWith('.html') && 
                              !lastPart.endsWith('.htm') && 
                              !lastPart.endsWith('.php');
                
                // Exclude obvious non-hubs
                const excluded = ['privacy', 'terms', 'signup', 'login', 'subscribe', 'search', 'help', 'contact'];
                if (excluded.some(ex => lastPart.includes(ex))) return;
                
                const isDate = /\d{4}/.test(lastPart) || (/\d/.test(lastPart) && !lastPart.startsWith('page'));
                
                if (!isDate && !isFile) {
                     const cleanUrl = url.href.split('#')[0];
                     const text = $a.text().trim().replace(/\s+/g, ' ');
                     
                     if (!hubs.has(cleanUrl)) {
                         hubs.set(cleanUrl, { url: cleanUrl, text, path: url.pathname, references: 0 });
                     }
                     hubs.get(cleanUrl).references++;
                }
            }
        } catch (e) {
            // ignore invalid URLs
        }
    });

    return Array.from(hubs.values())
        .filter(h => h.text.length > 2) // Filter empty/tiny links
        .sort((a, b) => a.path.localeCompare(b.path));
}

async function run() {
    try {
        log(`🕷️  Crawling index: ${seedUrl}`);
        const { html, url: finalUrl } = await fetchPage(seedUrl);
        // fetchPage already logs details
        
        log(`🔍 Analyzing ${html.length} bytes...`);
        const hubs = analyzeLinks(html, finalUrl);
        log(`✓ Analysis complete. Found ${hubs.length} candidates.`);

        if (hubs.length === 0) {
             try {
                const domain = new URL(finalUrl).hostname.replace(/[^a-z0-9]/gi, '_');
                const debugFile = path.resolve(__dirname, `../../tmp/debug_failed_${domain}.html`);
                fs.writeFileSync(debugFile, html);
                log(`⚠️  Zero hubs found. Saved HTML to ${debugFile}`);
             } catch (err) {
                 log(`(failed to save debug file: ${err.message})`);
             }
        }

        // Determine output file
        const HUBS_FILE = outputFile 
            ? path.resolve(process.cwd(), outputFile)
            : path.resolve(__dirname, '../../tmp/hub_discover_indices.hubs.json');
            
        try {
            // Ensure directory exists
            const dir = path.dirname(HUBS_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(HUBS_FILE, JSON.stringify({
                seed: seedUrl,
                finalUrl,
                totalHubs: hubs.length,
                hubs
            }, null, 2), 'utf8');
            log(`Wrote discovered hubs to ${HUBS_FILE}`);
        } catch (e) {
            error(`Failed to write hubs file: ${e.message}`);
        }

        if (jsonOutput) {
            // Print summary to stdout even in JSON mode
            process.stdout.write(JSON.stringify({
                seed: seedUrl,
                finalUrl,
                totalHubs: hubs.length,
                hubs
            }, null, 2) + '\n');
            log(`Discovered ${hubs.length} hubs (JSON output)`);
        } else {
            log(`\nFound ${hubs.length} potential hubs:\n`);

            // Group by parent folder
            const byFolder = {};
            hubs.forEach(h => {
                const folder = path.dirname(h.path);
                if (!byFolder[folder]) byFolder[folder] = [];
                byFolder[folder].push(h);
            });

            const folders = Object.keys(byFolder).sort();
            folders.forEach(folder => {
                const items = byFolder[folder];
                // Only show folders with significant items, or just top level
                if (items.length > 1) {
                    console.log(`\n📂 ${folder} (${items.length} items)`);
                    // Print first few examples
                    items.slice(0, 5).forEach(h => console.log(`   - ${h.text.padEnd(20)} => ${h.path}`));
                    if (items.length > 5) console.log(`     ... and ${items.length - 5} more`);
                }
            });

            console.log('\n✅ Done.');
        }

    } catch (e) {
        appendLog('FATAL: ' + e.message);
        if (jsonOutput) {
            process.stdout.write(JSON.stringify({ error: e.message }) + '\n');
        } else {
            error(`❌ Error: ${e.message}`);
        }
        // Always print error to stderr
        process.stderr.write(`hub-discover-indices error: ${e.message}\n`);
        process.exit(1);
    }
}

run();
