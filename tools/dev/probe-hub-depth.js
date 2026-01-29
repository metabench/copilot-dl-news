/**
 * 005-hub-depth-probe/run.js
 * Determine the depth (oldest article) of verified place hubs.
 */
const Database = require('better-sqlite3');
const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../data/news.db');
const db = new Database(dbPath, { readonly: false });

async function updateHubDepth(hubUrl, maxPage, oldestDate, error = null) {
    try {
        // Strip query params for matching
        const cleanUrl = hubUrl.split('?')[0].replace(/\/all$/, ''); // Match base URL logic if needed
        
        // We might match exact URL or base URL depending on how it's stored.
        // The probe might have modified the URL (e.g. appended /all).
        // Let's rely on the URL passed into probeDepth (original) first?
        // Actually, probeDepth determines the "working" URL.
        // But place_page_mappings stores the "canonical" URL. 
        // We should update based on the HOST + URL match.
        
        const stmt = db.prepare(`
            UPDATE place_page_mappings 
            SET max_page_depth = ?, 
                oldest_content_date = ?, 
                last_depth_check_at = datetime('now'),
                depth_check_error = ?
            WHERE url = ? OR url = ?
        `);
        
        // Try exact match or match without /all suffix
        const res = stmt.run(maxPage, oldestDate, error, hubUrl, hubUrl.replace(/\/all$/, ''));
        
        if (res.changes > 0) {
            // console.log(`  Updated DB: depth=${maxPage}, oldest=${oldestDate}`);
        } else {
            console.warn(`  Warning: Could not match ${hubUrl} to place_page_mappings for update.`);
        }
    } catch (e) {
        console.error(`  DB Update Error: ${e.message}`);
    }
}

async function getVerifiedHubs() {
    return db.prepare(`
        SELECT pm.host, pm.url, pn.name 
        FROM place_page_mappings pm
        JOIN places p ON p.id = pm.place_id
        JOIN place_names pn ON pn.place_id = p.id
        WHERE pm.host = 'theguardian.com' 
          AND pm.status = 'verified'
          AND p.kind = 'country'
          AND pn.is_preferred = 1
    `).all();
}

async function checkPage(url, pageNum, page1Signature = null) {
    const target = `${url}?page=${pageNum}`;
    try {
        const res = await fetch(target, {
            headers: { 'User-Agent': 'Mozilla/5.0 (DepthProbe/1.0)' },
            redirect: 'follow'
        });
        if (!res.ok) return { ok: false, status: res.status };
        
        // Check for redirect to Page 1
        if (pageNum > 1) {
            const currentUrl = res.url;
            if (!currentUrl.includes(`page=${pageNum}`)) {
                // Suspicious redirect (soft 404)
            }
        }
        
        const html = await res.text();
        const $ = cheerio.load(html);
        
        // Find article dates
        const times = [];
        $('time').each((i, el) => {
            const dt = $(el).attr('datetime');
            if (dt) times.push(dt);
        });

        // Find signature (first 3 unique article links)
        // This avoids false positives from sticky headers/sidebars if we only checked the first one
        const articleLinks = new Set();
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            // Guardian standard article pattern: /YYYY/mmm/dd/title
            if (href && href.match(/\/\d{4}\/\w{3}\/\d{2}\//)) {
                articleLinks.add(href);
                if (articleLinks.size >= 3) return false; // break after 3
            }
        });
        
        if (times.length === 0) return { ok: true, count: 0 };
        
        // Sort times to find oldest
        times.sort(); 
        
        const signature = Array.from(articleLinks).join('|') || times.join('|');

        const result = { 
            ok: true, 
            count: times.length, 
            oldest: times[0], 
            newest: times[times.length - 1],
            signature
        };
        
        // Loopback detection
        // If pageNum > 1 and we have a signature match with Page 1...
        if (page1Signature && result.signature === page1Signature && pageNum > 1) {
             return { ok: false, status: 'Loopback to Page 1' };
        }

        return result;
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function probeDepth(hub, isRetry = false) {
    if (isRetry) {
        console.log(`  > Retry Probe: ${hub.name} (${hub.url})...`);
    } else {
        console.log(`Probing ${hub.name} (${hub.url})...`);
    }
    
    // Get Page 1 signature
    const page1 = await checkPage(hub.url, 1);
    if (!page1.ok || page1.count === 0) {
        console.log(`  Page 1 failed or empty.`);
        return { name: hub.name, url: hub.url, maxPage: 0, oldestDate: null };
    }
    const page1Signature = page1.signature;
    if (!isRetry) console.log(`  Page 1: ${page1.count} articles, oldest: ${page1.oldest.slice(0,10)}`);
    
    // Exponential search for upper bound
    let lower = 1;
    let upper = 2; // Start from 2
    let lastGood = { page: 1, ...page1 };
    
    // 1. Find upper bound (first page that fails or is empty)
    while (true) {
        process.stdout.write(`  Checking page ${upper}... `);
        const res = await checkPage(hub.url, upper, page1Signature);
        
        if (res.ok && res.count > 0) {
            // TIME CONTINUITY CHECK:
            // If the oldest article on this page is significantly NEWER than the previous page's oldest,
            // we have likely looped back to the start (redirect to Page 1).
            // Pagination goes BACK in time (2025 -> 2024).
            // If check page 2048 (2026) comes after page 1024 (2024), that's invalid.
            if (lastGood && res.oldest > lastGood.oldest && new Date(res.oldest) > new Date(lastGood.oldest)) {
                 // Check if it's a large jump (e.g. > 7 days newer). Small fluctuations happen due to pin/unpin.
                 const daysDiff = (new Date(res.oldest) - new Date(lastGood.oldest)) / (1000 * 3600 * 24);
                 if (daysDiff > 7) {
                      console.log(`Loopback detected via Time Travel (+${daysDiff.toFixed(1)} days).`);
                      // Treat as failure/empty to stop the upper bound search
                      // But we need to make sure loop terminates.
                      // Break loop logic below handles "else" branch.
                      res.ok = false; 
                 }
            }
        }
        
        if (res.ok && res.count > 0) {
            console.log(`OK (${res.count} articles, oldest: ${res.oldest.slice(0,10)})`);
            lastGood = { page: upper, ...res };
            lower = upper;
            upper *= 2;
            if (upper > 10000) break; // Safety cap
        } else {
            console.log(res.ok ? `Empty/Loopback.` : `Failed (${res.status}).`);
            
            // SPECIAL HANDLER: If failing at upper=2 on first try, attempt variant check
            // Guardian sections (us-news, australia-news) often need /all for pagination
            if (upper === 2 && !isRetry) {
                 if (!hub.url.includes('/world/') && !hub.url.endsWith('/all')) {
                      const variantUrl = hub.url.replace(/\/$/, '') + '/all';
                      console.log(`  [Heuristic] Possible specific section. Retrying with ${variantUrl}...`);
                      return probeDepth({ ...hub, url: variantUrl }, true);
                 }
            }
            
            break;
        }
        await new Promise(r => setTimeout(r, 500)); // Rate limit
    }
    
    // 2. Binary search between lower and upper
    // We know lower is good, upper is bad/empty.
    // Refine to find exact last page.
    let bestPage = lastGood ? lastGood.page : 1;
    let oldestDate = lastGood ? lastGood.oldest : null;
    
    let left = lower + 1;
    let right = upper - 1;
    
    if (left <= right) {
        console.log(`  Binary searching between ${left} and ${right}...`);
    }
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        process.stdout.write(`  Checking page ${mid}... `);
        const res = await checkPage(hub.url, mid, page1Signature);
        
        // Apply Time Continuity Check in binary search too
        if (res.ok && res.count > 0 && oldestDate) {
             const daysDiff = (new Date(res.oldest) - new Date(oldestDate)) / (1000 * 3600 * 24);
             if (daysDiff > 7) {
                  console.log(`Loopback (Time Travel +${daysDiff.toFixed(1)}d).`);
                  res.ok = false;
             }
        }
        
        if (res.ok && res.count > 0) {
            console.log(`OK (${res.count} articles, oldest: ${res.oldest.slice(0,10)})`);
            bestPage = mid;
            oldestDate = res.oldest; // Update running oldest for next comparisons
            left = mid + 1;
        } else {
            console.log(res.ok ? 'Empty/Loopback.' : `Failed (${res.status}).`);
            right = mid - 1;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`✅ ${hub.name}: Max Page ~${bestPage}, Oldest Article: ${oldestDate}`);
    
    // Save to DB
    await updateHubDepth(hub.url, bestPage, oldestDate);

    return { 
        name: hub.name, 
        url: hub.url, 
        maxPage: bestPage, 
        oldestDate 
    };
}

async function main() {
    const hubs = await getVerifiedHubs();
    console.log(`Found ${hubs.length} verified hubs (raw rows).`);
    
    // Deduplicate by URL
    const uniqueHubs = [];
    const seen = new Set();
    for (const h of hubs) {
        if (!seen.has(h.url)) {
            seen.add(h.url);
            uniqueHubs.push(h);
        }
    }
    console.log(`Unique URLs: ${uniqueHubs.length}`);
    
    if (uniqueHubs.length === 0) return;
    
    // Command line args
    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 5;
    
    const targetArg = process.argv.find(a => a.startsWith('--target='));
    
    // Pick specific samples to be diverse if no limit override used or if just testing
    // e.g. France, New Zealand, Yemen, United States, Madagascar
    const targets = targetArg ? [targetArg.split('=')[1]] : ['France', 'New Zealand', 'Yemen', 'United States', 'Madagascar'];
    let finalSample = [];
    
    // 1. Add priority targets if they exist
    for (const t of targets) {
        // Find index of priority target in uniqueHubs
        // Allow partial match
        const idx = uniqueHubs.findIndex(h => h.name.toLowerCase().includes(t.toLowerCase()));
        if (idx !== -1) {
             finalSample.push(uniqueHubs[idx]);
             // Remove from pool so we don't pick it again
             uniqueHubs.splice(idx, 1);
        }
    }
    
    // 2. Fill the rest of the limit from the remaining pool
    // If limit is huge (e.g. 264), we just take everything remaining.
    while(finalSample.length < limit && uniqueHubs.length > 0) {
        // Shift from front (or we could random pick, but front is fine for stability)
        finalSample.push(uniqueHubs.shift());
    }
    
    const results = [];
    for (const hub of finalSample) {
        results.push(await probeDepth(hub));
    }
    
    fs.writeFileSync(
        path.join(__dirname, 'results.json'), 
        JSON.stringify(results, null, 2)
    );
    console.log('Results saved to results.json');
}

main();
