#!/usr/bin/env node
/**
 * add-regional-news-sources.js
 * 
 * Adds news sources local to Colombia, Venezuela, Canada, and Ontario
 * 
 * Usage:
 *   node tools/migrations/add-regional-news-sources.js [--dry-run]
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../data/news.db');
const isDryRun = process.argv.includes('--dry-run');

// Regional news sources to add
const REGIONAL_SOURCES = [
  // Colombia (3 sources)
  {
    url: 'https://www.eltiempo.com',
    label: 'El Tiempo',
    parent_domain: 'eltiempo.com',
    website_type: 'domain',
    metadata: { icon: '🇨🇴', region: 'Colombia', language: 'es' }
  },
  {
    url: 'https://www.elespectador.com',
    label: 'El Espectador',
    parent_domain: 'elespectador.com',
    website_type: 'domain',
    metadata: { icon: '🇨🇴', region: 'Colombia', language: 'es' }
  },
  {
    url: 'https://www.semana.com',
    label: 'Semana',
    parent_domain: 'semana.com',
    website_type: 'domain',
    metadata: { icon: '🇨🇴', region: 'Colombia', language: 'es' }
  },
  
  // Venezuela (3 sources)
  {
    url: 'https://efectococuyo.com',
    label: 'Efecto Cocuyo',
    parent_domain: 'efectococuyo.com',
    website_type: 'domain',
    metadata: { icon: '🇻🇪', region: 'Venezuela', language: 'es' }
  },
  {
    url: 'https://www.elnacional.com',
    label: 'El Nacional',
    parent_domain: 'elnacional.com',
    website_type: 'domain',
    metadata: { icon: '🇻🇪', region: 'Venezuela', language: 'es' }
  },
  {
    url: 'https://runrun.es',
    label: 'RunRun.es',
    parent_domain: 'runrun.es',
    website_type: 'domain',
    metadata: { icon: '🇻🇪', region: 'Venezuela', language: 'es' }
  },
  
  // Canada - National (3 sources)
  {
    url: 'https://www.cbc.ca/news',
    label: 'CBC News',
    parent_domain: 'cbc.ca',
    website_type: 'path',
    url_pattern: 'https://www.cbc.ca/news/%',
    metadata: { icon: '🇨🇦', region: 'Canada', language: 'en' }
  },
  {
    url: 'https://www.theglobeandmail.com',
    label: 'The Globe and Mail',
    parent_domain: 'theglobeandmail.com',
    website_type: 'domain',
    metadata: { icon: '🇨🇦', region: 'Canada', language: 'en' }
  },
  {
    url: 'https://nationalpost.com',
    label: 'National Post',
    parent_domain: 'nationalpost.com',
    website_type: 'domain',
    metadata: { icon: '🇨🇦', region: 'Canada', language: 'en' }
  },
  
  // Ontario, Canada - Local (3 sources)
  {
    url: 'https://www.thestar.com',
    label: 'Toronto Star',
    parent_domain: 'thestar.com',
    website_type: 'domain',
    metadata: { icon: '🍁', region: 'Ontario, Canada', language: 'en' }
  },
  {
    url: 'https://ottawacitizen.com',
    label: 'Ottawa Citizen',
    parent_domain: 'ottawacitizen.com',
    website_type: 'domain',
    metadata: { icon: '🍁', region: 'Ontario, Canada', language: 'en' }
  },
  {
    url: 'https://www.tvo.org/current-affairs',
    label: 'TVO Current Affairs',
    parent_domain: 'tvo.org',
    website_type: 'path',
    url_pattern: 'https://www.tvo.org/%',
    metadata: { icon: '🍁', region: 'Ontario, Canada', language: 'en' }
  }
];

function addRegionalSources() {
  console.log(`=== Adding Regional News Sources ===`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}\n`);
  
  const db = new Database(dbPath);
  
  try {
    // Check what already exists
    const existing = db.prepare(`
      SELECT parent_domain FROM news_websites
    `).all().map(r => r.parent_domain);
    
    console.log(`Existing sources: ${existing.length}`);
    
    const toAdd = [];
    const skipped = [];
    
    for (const source of REGIONAL_SOURCES) {
      if (existing.includes(source.parent_domain)) {
        skipped.push(source);
      } else {
        toAdd.push(source);
      }
    }
    
    console.log(`To add: ${toAdd.length}`);
    console.log(`Already exist: ${skipped.length}\n`);
    
    if (skipped.length > 0) {
      console.log('Skipping (already exist):');
      for (const s of skipped) {
        console.log(`  - ${s.label} (${s.parent_domain})`);
      }
      console.log();
    }
    
    if (toAdd.length === 0) {
      console.log('No new sources to add.');
      return;
    }
    
    console.log('Adding:');
    for (const s of toAdd) {
      console.log(`  + ${s.label} (${s.parent_domain}) - ${s.metadata.region}`);
    }
    console.log();
    
    if (isDryRun) {
      console.log('DRY-RUN: No changes made.');
      return;
    }
    
    // Insert new sources
    const insert = db.prepare(`
      INSERT INTO news_websites (url, label, parent_domain, url_pattern, website_type, added_at, added_by, enabled, metadata)
      VALUES (@url, @label, @parent_domain, @url_pattern, @website_type, datetime('now'), 'migration', 1, @metadata)
    `);
    
    const insertMany = db.transaction((sources) => {
      for (const source of sources) {
        insert.run({
          url: source.url,
          label: source.label,
          parent_domain: source.parent_domain,
          url_pattern: source.url_pattern || `${source.url}/%`,
          website_type: source.website_type,
          metadata: JSON.stringify(source.metadata)
        });
      }
    });
    
    insertMany(toAdd);
    
    console.log(`✅ Added ${toAdd.length} regional news sources.`);
    
    // Show final count
    const total = db.prepare(`SELECT COUNT(*) as count FROM news_websites`).get().count;
    console.log(`Total news sources: ${total}`);
    
    // Show by region
    console.log('\nBy region:');
    const byRegion = {};
    for (const s of REGIONAL_SOURCES) {
      const region = s.metadata.region;
      byRegion[region] = (byRegion[region] || 0) + 1;
    }
    for (const [region, count] of Object.entries(byRegion)) {
      console.log(`  ${region}: ${count}`);
    }
    
  } finally {
    db.close();
  }
}

addRegionalSources();
