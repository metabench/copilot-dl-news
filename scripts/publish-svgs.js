const fs = require('fs');
const path = require('path');
const http = require('http');

const REMOTE_URL = 'http://144.21.35.104:4700';
const SAVE_ENDPOINT = '/api/plugins/svg-editor/save';

const FILES_TO_PUBLISH = [
    {
        local: 'docs/design/mcp-sampling-architecture.svg',
        remote: 'design/mcp-sampling-architecture.svg'
    },
    {
        local: 'docs/design/collaborative-agent-architecture.svg',
        remote: 'design/collaborative-agent-architecture.svg'
    },
    {
        local: 'docs/design/module-extraction-roadmap.svg',
        remote: 'design/module-extraction-roadmap.svg'
    },
    {
        local: 'docs/design/agent-lab-vision.svg',
        remote: 'design/agent-lab-vision.svg'
    }
];

async function publish(file) {
    const localPath = path.resolve(__dirname, '..', file.local);
    console.log(`Reading ${localPath}...`);
    const content = fs.readFileSync(localPath, 'utf8');

    const payload = JSON.stringify({
        filePath: file.remote,
        content: content,
        logEntry: "Published by Agent via publish-svgs.js"
    });

    console.log(`Uploading to ${REMOTE_URL}${SAVE_ENDPOINT}...`);

    return new Promise((resolve, reject) => {
        const req = http.request(REMOTE_URL + SAVE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Success: ${file.remote}`);
                    resolve();
                } else {
                    console.error(`❌ Failed: ${res.statusCode} ${data}`);
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error(`❌ Network Error: ${err.message}`);
            reject(err);
        });

        req.write(payload);
        req.end();
    });
}

(async () => {
    try {
        for (const file of FILES_TO_PUBLISH) {
            await publish(file);
        }
    } catch (err) {
        process.exit(1);
    }
})();
