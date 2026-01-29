const Database = require('better-sqlite3');
const db = new Database('data/news.db');

const columnsToAdd = [
    { name: 'path', type: 'TEXT' },
    { name: 'status', type: "TEXT DEFAULT 'pending'" },
    { name: 'depth', type: 'INTEGER DEFAULT 0' },
    { name: 'discovered_from', type: 'TEXT' },
    { name: 'http_status', type: 'INTEGER' },
    { name: 'content_type', type: 'TEXT' },
    { name: 'content_length', type: 'INTEGER' },
    { name: 'title', type: 'TEXT' },
    { name: 'word_count', type: 'INTEGER' },
    { name: 'links_found', type: 'INTEGER DEFAULT 0' },
    { name: 'classification', type: 'TEXT' },
    { name: 'fetched_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'error_msg', type: 'TEXT' }
];

console.log('Checking columns...');
const existing = db.prepare("PRAGMA table_info(urls)").all().map(c => c.name);

for (const col of columnsToAdd) {
    if (!existing.includes(col.name)) {
        console.log(`Adding column: ${col.name}`);
        try {
            db.prepare(`ALTER TABLE urls ADD COLUMN ${col.name} ${col.type}`).run();
        } catch (e) {
            console.error(`Failed to add ${col.name}: ${e.message}`);
        }
    } else {
        console.log(`Skipping existing: ${col.name}`);
    }
}

// create index on status if needed
try {
    db.prepare("CREATE INDEX IF NOT EXISTS idx_urls_status ON urls(status)").run();
    console.log("Verified status index.");
} catch (e) { console.error(e.message); }

console.log('Migration complete.');
