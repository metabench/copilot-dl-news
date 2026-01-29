const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const targets = [
    { host: 'bbc.com', patterns: ['/news/world/{slug}', '/news/world-{slug}', '/news/{slug}'] },
    { host: 'aljazeera.com', patterns: ['/where/{slug}', '/country/{slug}', '/dict/{slug}'] },
    { host: 'independent.co.uk', patterns: ['/topic/{slug}', '/region/{slug}'] },
    { host: 'reuters.com', patterns: ['/world/{slug}', '/places/{slug}', '/countries/{slug}'] }
];

const testSlugs = ['france', 'united-states', 'new-zealand', 'vietnam', 'chile'];

async function probe() {
    for (const t of targets) {
        console.log(`\n--- Probing ${t.host} ---`);
        for (const p of t.patterns) {
            let hit = false;
            for (const s of testSlugs) {
                const url = `https://www.${t.host}${p.replace('{slug}', s)}`;
                try {
                    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
                    if (res.ok) {
                        const msg = `✅ MATCH: ${p} -> ${url}`;
                        console.log(msg);
                        require('fs').appendFileSync('tmp/probe_results.txt', msg + '\n');
                        hit = true;
                    } 
                } catch (e) {
                   // ignore
                }
            }
            if (hit) console.log(`  Pattern ${p} seems promising.`);
        }
    }
}

require('fs').writeFileSync('tmp/probe_results.txt', ''); // clear file
probe();
