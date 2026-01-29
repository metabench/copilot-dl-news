
const http = require('http');

const PORT = 3120;
const BASE_URL = `http://localhost:${PORT}`;

async function checkEndpoint(url, name) {
    return new Promise((resolve) => {
        http.get(url, (res) => {
            const { statusCode } = res;
            let rawData = '';

            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                if (statusCode >= 200 && statusCode < 300) {
                    console.log(`[PASS] ${name} (${url}): Status ${statusCode}`);
                    resolve({ ok: true, data: rawData });
                } else {
                    console.log(`[FAIL] ${name} (${url}): Status ${statusCode}`);
                    resolve({ ok: false, status: statusCode });
                }
            });
        }).on('error', (e) => {
            console.log(`[FAIL] ${name} (${url}): Error: ${e.message}`);
            resolve({ ok: false, error: e });
        });
    });
}

async function runTests() {
    console.log('Verifying Lab Backend Endpoints...\n');

    // 1. Check Root (200 OK)
    await checkEndpoint(`${BASE_URL}/`, 'Root Page');

    // 2. Check /api/jobs (200 OK, JSON Array)
    const jobs = await checkEndpoint(`${BASE_URL}/api/jobs`, 'Jobs API');
    if (jobs.ok) {
        try {
            const list = JSON.parse(jobs.data);
            if (Array.isArray(list)) {
                console.log(`   -> Valid JSON Array (Length: ${list.length})`);
            } else {
                console.log(`   -> [FAIL] Expected JSON Array, got: ${typeof list}`);
            }
        } catch (e) {
            console.log(`   -> [FAIL] Invalid JSON: ${e.message}`);
        }
    }

    // 3. Check /cell (200 OK) - Using a mock placeId
    // Need a valid placeId from default DB or error gracefully
    // Let's use placeId=418 from previous logs, assuming DB content
    const cell = await checkEndpoint(`${BASE_URL}/cell?placeId=418&host=dailymail.co.uk&kind=country&pageKind=country-hub`, 'Cell Drilldown');
    if (cell.ok) {
        if (cell.data.includes('Cannot GET')) {
            console.log('   -> [FAIL] "Cannot GET" in response body');
        } else {
            console.log('   -> Content Length: ' + cell.data.length);
        }
    }
}

if (require.main === module) {
    runTests();
}
