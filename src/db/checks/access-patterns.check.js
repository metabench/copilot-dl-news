const NewsDatabaseFacade = require('../../db');
const path = require('path');

console.log('--- Lab Experiment: DB Access Patterns ---');

// 1. The "Old Way" (Current)
// You have to know how to create it, pass options, and manage the instance.
console.log('\n[Old Way] Creating DB instance manually...');
try {
    const dbPath = path.join(__dirname, '../../../data/news.db');
    const dbWrapper = new NewsDatabaseFacade({
        engine: 'sqlite',
        dbPath: dbPath,
        readonly: true
    });
    
    console.log('[Old Way] DB Wrapper created successfully.');
    console.log('[Old Way] Wrapper type:', dbWrapper.constructor.name);
    
    // Simulate passing it to a component
    // Note: WikidataCountryIngestor expects the RAW handle (with prepare), not the wrapper.
    // So we have to know to unwrap it.
    const rawDb = dbWrapper.getHandle(); 
    
    const component = {
        db: rawDb,
        run: function() {
            console.log('[Old Way] Component running with injected DB.');
            // Just check if we can prepare a statement (smoke test)
            try {
                const stmt = this.db.prepare('SELECT 1 as val');
                const res = stmt.get();
                console.log('[Old Way] Query result:', res);
            } catch (e) {
                console.error('[Old Way] Query failed:', e.message);
            }
        }
    };
    component.run();

} catch (err) {
    console.error('[Old Way] Failed:', err);
}

// 2. The "New Way" (Proposed)
// We want to just do: const { getDb } = require('../src/db'); const db = getDb();
console.log('\n[New Way] Attempting to use getDb() (should fail or be undefined currently)...');
try {
    const { getDb } = require('../../db');
    if (typeof getDb !== 'function') {
        console.log('[New Way] getDb is not defined yet (Expected).');
    } else {
        // We expect getDb to handle defaults if no options passed, 
        // or we might need to pass them once.
        // For this test, we'll assume it might need initialization or auto-discovery.
        const db = getDb(); 
        console.log('[New Way] Got DB instance:', db ? 'Yes' : 'No');
        
        if (db) {
             const rawDb = db.getHandle ? db.getHandle() : db;
             const stmt = rawDb.prepare('SELECT 1 as val');
             const res = stmt.get();
             console.log('[New Way] Query result:', res);
        }
    }
} catch (err) {
    console.error('[New Way] Error:', err);
}
