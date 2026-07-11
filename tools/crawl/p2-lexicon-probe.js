#!/usr/bin/env node
'use strict';
// READ-ONLY: inspect gazetteer/topic tables on production news.db to shape the
// segmentation engine's lexicon queries. Reports counts + samples + schema.
const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(path.resolve(process.cwd(), 'data/news.db'), { readonly: true });
const out = {};
function safe(fn){ try { return fn(); } catch(e){ return 'ERR '+e.message; } }
for (const t of ['places','place_names','topic_keywords','non_geo_topic_slugs','topic_page_mappings']) {
  out[t] = {
    cols: safe(()=>db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name)),
    count: safe(()=>db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n)
  };
}
// Sample: how are place names/slugs stored? Look for zimbabwe, russia, ukraine, new caledonia.
out.placeNameSamples = safe(()=>db.prepare(
  "SELECT name, place_id FROM place_names WHERE lower(name) IN ('russia','ukraine','zimbabwe','new caledonia','united states','china','israel','gaza') LIMIT 20").all());
out.topicSamples = safe(()=>db.prepare("SELECT * FROM topic_keywords LIMIT 8").all());
out.nonGeoSamples = safe(()=>db.prepare("SELECT * FROM non_geo_topic_slugs LIMIT 8").all());
db.close();
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
