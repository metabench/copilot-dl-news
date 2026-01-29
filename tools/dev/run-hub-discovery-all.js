const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// -- Configuration --
const SOURCES_FILE = path.resolve(__dirname, '../../data/bootstrap/news-sources.json');
const OUTPUT_DIR = path.resolve(__dirname, '../../tmp/discovery');
const TOOL_PATH = path.resolve(__dirname, 'hub-discover-indices.js');

const SKIP_DOMAINS = [];

// Known index page patterns override
// If a domain isn't here, we default to trying /world
const INDEX_OVERRIDES = {
    'www.theguardian.com': '/world/all', // The definitive index
    'www.bbc.com': '/news/world',
    'www.reuters.com': '/world',
    'apnews.com': '/hub/world-news', // AP uses /hub/
    'www.nytimes.com': '/section/world',
    'www.washingtonpost.com': '/world',
    'www.cnn.com': '/world',
    'www.npr.org': '/sections/world',
    'www.aljazeera.com': '/news', // AJ uses /news/region
    'www.independent.co.uk': '/world',
    'www.telegraph.co.uk': '/world-news',
    'news.sky.com': '/world',
    'www.dailymail.co.uk': '/news/worldnews/index.html',
    'www.mirror.co.uk': '/news/world-news',
    'www.thesun.co.uk': '/news/world',
    'www.euronews.com': '/news/international',
    'www.dw.com': '/en/world/s-1429', // tricky, english specific
    'www.france24.com': '/en', // often regional nav
    'www.abc.net.au': '/news/world',
    'www.smh.com.au': '/world',
    'www.scmp.com': '/news/world',
    'www.straitstimes.com': '/world',
    'www.japantimes.co.jp': '/news/world',
    'techcrunch.com': '/', // Tech sites might not have /world
    'www.theverge.com': '/',
    'arstechnica.com': '/',
    'www.wired.com': '/',
    'www.ft.com': '/world',
    'www.bloomberg.com': '/economics', // or /markets
    'www.wsj.com': '/world',
    'www.economist.com': '/sections/international',
    'www.nature.com': '/',
    'www.science.org': '/',
    'www.newscientist.com': '/'
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSources() {
    if (!fs.existsSync(SOURCES_FILE)) {
        console.error(`Sources file not found: ${SOURCES_FILE}`);
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'));
    return data.sources || [];
}

function getIndexUrl(source) {
    try {
        const url = new URL(source.url);
        const host = url.hostname;
        
        // Check overrides
        if (INDEX_OVERRIDES[host]) {
            const path = INDEX_OVERRIDES[host];
            if (path.startsWith('http')) return path; // Full URL override
            return new URL(path, source.url).href;
        }

        // Default heuristic
        return new URL('/world', source.url).href;
    } catch (e) {
        return null;
    }
}

async function run() {
    ensureDir(OUTPUT_DIR);
    const sources = loadSources();
    const results = [];

    console.log(`Loaded ${sources.length} sources.`);
    console.log(`Output directory: ${OUTPUT_DIR}\n`);

    for (const source of sources) {
        const indexUrl = getIndexUrl(source);
        if (!indexUrl) {
            console.log(`Skipping invalid URL source: ${source.label}`);
            continue;
        }

        const domain = new URL(source.url).hostname;
        
        if (SKIP_DOMAINS.includes(domain)) {
            console.log(`⏩ Skipping ${source.label} (in SKIP_DOMAINS)`);
            continue;
        }

        const outputFile = path.join(OUTPUT_DIR, `${domain}.json`);

        // Skip if already processed successfully
        if (fs.existsSync(outputFile)) {
            try {
                const existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                if (existing.totalHubs > 0) {
                    console.log(`⏭️  Skipping ${source.label} (${domain}) - already has ${existing.totalHubs} hubs`);
                    results.push({ 
                        source: source.label, 
                        domain, 
                        hubs: existing.totalHubs, 
                        url: indexUrl,
                        file: outputFile 
                    });
                    continue;
                }
            } catch (e) {
                // corrupted file, re-run
            }
        }

        console.log(`🔭 Probing ${source.label} (${domain})`);
        console.log(`   Target: ${indexUrl}`);

        try {
            // Run the discovery tool synchronously
            // We use the --output flag we just added
            execSync(`node "${TOOL_PATH}" "${indexUrl}" --output "${outputFile}" --json`, {
                stdio: 'inherit', // show output
                timeout: 90000 // 90s timeout per site (increased for Puppeteer)
            });

            // Check if result file exists
            if (fs.existsSync(outputFile)) {
                const data = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                const hubCount = data.totalHubs || 0;
                console.log(`   ✓ Found ${hubCount} hubs`);
                results.push({ 
                    source: source.label, 
                    domain, 
                    hubs: hubCount, 
                    url: indexUrl,
                    file: outputFile 
                });
            } else {
                console.log(`   ⚠ No output file generated`);
                results.push({ source: source.label, domain, hubs: 0, error: "No output" });
            }

        } catch (e) {
            console.log(`   ✗ Failed: ${e.message.split('\n')[0]}`);
            results.push({ source: source.label, domain, hubs: 0, error: e.message });
        }
        console.log(''); // newline
    }

    // Summary
    console.log('='.repeat(50));
    console.log('Hub Discovery Summary');
    console.log('='.repeat(50));
    
    // Sort by hub count desc
    results.sort((a, b) => (b.hubs || 0) - (a.hubs || 0));

    results.forEach(r => {
        const status = r.error ? '❌' : (r.hubs > 0 ? '✅' : '⚠️');
        console.log(`${status} ${r.source.padEnd(25)} : ${r.hubs} hubs ${r.error ? `(${r.error})` : ''}`);
        
        // Verify key regions check (quick scan of output)
        if (r.hubs > 0 && r.file) {
            try {
                const data = JSON.parse(fs.readFileSync(r.file, 'utf8'));
                const paths = data.hubs.map(h => h.path);
                const hasAfrica = paths.some(p => p.includes('africa'));
                const hasAsia = paths.some(p => p.includes('asia'));
                const hasEurope = paths.some(p => p.includes('europe'));
                const regions = [hasAfrica?'Africa':'', hasAsia?'Asia':'', hasEurope?'Europe':''].filter(Boolean).join(',');
                if (regions) console.log(`    Regions: ${regions}`);
            } catch(e) {}
        }
    });

    // Write aggregate summary
    fs.writeFileSync(
        path.join(OUTPUT_DIR, '_summary.json'), 
        JSON.stringify(results, null, 2)
    );
}

run();
