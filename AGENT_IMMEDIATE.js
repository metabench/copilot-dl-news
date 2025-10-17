const path = require('path');
const { ensureDatabase } = require('./src/db/sqlite');
const WikidataAdm1Ingestor = require('./src/crawler/gazetteer/ingestors/WikidataAdm1Ingestor');

(async () => {
  const dbPath = path.join(__dirname, 'data', 'news.db');
  const db = ensureDatabase(dbPath);

  try {
    const ingestor = new WikidataAdm1Ingestor({
      db,
      useDynamicFetch: true,
      useSnapshot: true,
      useCache: false,
      limitCountries: 1,
      timeoutMs: 60000,
      sleepMs: 0,
      targetCountries: [
        { code: 'GB', qid: 'Q145', name: 'United Kingdom', raw: 'GB' }
      ],
      logger: {
        info: (...args) => console.log('[adm1]', ...args),
        warn: (...args) => console.warn('[adm1]', ...args),
        error: (...args) => console.error('[adm1]', ...args)
      }
    });

    console.log('[adm1] Starting targeted GB ADM1 backfill (dry run)');
    const summary = await ingestor.execute({});
    console.log('[adm1] Summary:', JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('[adm1] Execution failed:', error);
    process.exitCode = 1;
  } finally {
    try {
      db.close();
    } catch (closeError) {
      console.error('[adm1] Failed to close database:', closeError.message);
    }
  }
})();
