#!/usr/bin/env node

/**
 * One-time script to add a 'planet' hub for Earth.
 */

const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDatabase } = require('../db/sqlite');

const projectRoot = findProjectRoot(__dirname);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  orange: '\x1b[38;5;208m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const PLANET_ID = 999999;
const PLANET_NAME = 'Earth';
const PLANET_SYNONYM = 'world';
const POPULATION = 8000000000;

async function main() {
  let db;
  try {
    console.log(`${colors.dim}Connecting to database...${colors.reset}`);
    const dbPath = path.join(projectRoot, 'data', 'news.db');
    db = ensureDatabase(dbPath);

    // Check if planet already exists
    const existingPlace = db.prepare('SELECT id FROM places WHERE id = ?').get(PLANET_ID);
    if (existingPlace) {
      console.log(`${colors.orange}Planet '${PLANET_NAME}' with ID ${PLANET_ID} already exists.${colors.reset}`);
    } else {
      console.log(`Inserting '${PLANET_NAME}' into places table...`);
      db.prepare(
        "INSERT INTO places (id, kind, population) VALUES (?, 'planet', ?)"
      ).run(PLANET_ID, POPULATION);
      console.log(`${colors.green}Successfully inserted place.${colors.reset}`);
    }

    const existingName = db.prepare('SELECT id FROM place_names WHERE place_id = ? AND name = ?').get(PLANET_ID, PLANET_NAME);
    if (existingName) {
        console.log(`${colors.orange}Place name '${PLANET_NAME}' already exists.${colors.reset}`);
    } else {
        console.log(`Inserting name '${PLANET_NAME}' into place_names...`);
        db.prepare(
            'INSERT INTO place_names (place_id, name, name_kind, lang) VALUES (?, ?, ?, ?)'
        ).run(PLANET_ID, PLANET_NAME, 'common', 'en');
        console.log(`${colors.green}Successfully inserted name.${colors.reset}`);
    }

    const existingSynonym = db.prepare('SELECT id FROM place_names WHERE place_id = ? AND name = ?').get(PLANET_ID, PLANET_SYNONYM);
    if (existingSynonym) {
        console.log(`${colors.orange}Synonym '${PLANET_SYNONYM}' already exists.${colors.reset}`);
    } else {
        console.log(`Inserting synonym '${PLANET_SYNONYM}' into place_names...`);
        db.prepare(
            'INSERT INTO place_names (place_id, name, name_kind, lang) VALUES (?, ?, ?, ?)'
        ).run(PLANET_ID, PLANET_SYNONYM, 'alias', 'en');
        console.log(`${colors.green}Successfully inserted synonym.${colors.reset}`);
    }

    console.log(`\n${colors.bold}Verification:${colors.reset}`);
    const finalCheck = db.prepare(`
        SELECT p.id, p.kind, p.canonical_name_id, pn.name as synonym
        FROM places p
        LEFT JOIN place_names pn ON p.id = pn.place_id
        WHERE p.id = ?
    `).all(PLANET_ID);

    if (finalCheck.length > 0) {
        console.log(`${colors.green}Successfully verified planet hub in database.${colors.reset}`);
        console.log(JSON.stringify(finalCheck, null, 2));
    } else {
        console.error(`${colors.orange}Verification failed. Could not find the new planet hub.${colors.reset}`);
    }

  } catch (error) {
    console.error(`\n${colors.bold}${colors.orange}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
      if (db) {
          db.close();
      }
  }
}

main();
