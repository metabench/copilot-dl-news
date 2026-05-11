#!/usr/bin/env node

/**
 * list-topic-hubs - List all discovered topic hubs from the database
 *
 * Usage:
 *   node tools/gazetteer/list-topic-hubs.js
 */

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');
const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const {
  listTopicHubDisplayRowsForHostPattern
} = resolveNewsCrawlerDbModule();

// Load configuration
const configPath = path.join(__dirname, '..', '..', 'config.json');
let config = { url: 'https://www.theguardian.com' };

try {
  const configData = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configData);
} catch (error) {
  console.warn(`Warning: Could not load config.json, using default URL`);
}

// Extract domain from URL
const domain = new URL(config.url).hostname;

// Initialize database
const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

const topicHubs = listTopicHubDisplayRowsForHostPattern(db, `%${domain}%`);

// Format the hubs
const hubs = topicHubs.map(hub => {
  // Use topic_slug as the name, but capitalize it nicely
  const name = hub.topic_slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return { name, title: hub.title, url: hub.url };
});

// Remove duplicates by name (keep first occurrence)
const uniqueHubs = [];
const seenNames = new Set();

hubs.forEach(hub => {
  if (!seenNames.has(hub.name.toLowerCase())) {
    seenNames.add(hub.name.toLowerCase());
    uniqueHubs.push(hub);
  }
});

// Display results
console.log(`\n🗂️  Topic Hubs (${config.url})\n`);
console.log('─'.repeat(80));

if (uniqueHubs.length === 0) {
  console.log('\nNo topic hubs found in database.\n');
} else {
  uniqueHubs.forEach((hub, index) => {
    const num = `${index + 1}.`.padEnd(6);
    console.log(`${num}${hub.name}`);
  });

  console.log('\n' + '─'.repeat(80));
  console.log(`Total: ${uniqueHubs.length} topic hub${uniqueHubs.length === 1 ? '' : 's'}\n`);
}

// Close database
db.close();

