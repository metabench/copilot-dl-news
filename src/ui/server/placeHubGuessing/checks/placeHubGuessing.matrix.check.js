#!/usr/bin/env node
'use strict';

const path = require('path');

const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');
const { renderPlaceHubGuessingMatrixHtml } = require('../server');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
}

function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Place Hub Guessing — Matrix');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  const { dbHandle } = resolved;

  try {
    check(!!dbHandle, 'Database handle resolved');

    const html = renderPlaceHubGuessingMatrixHtml({
      dbHandle,
      placeKind: 'country',
      pageKind: 'country-hub',
      placeLimit: 8,
      hostLimit: 8,
      matrixMode: 'table'
    });

    check(typeof html === 'string' && html.length > 500, 'HTML rendered');
    check(html.includes('data-testid="place-hub-guessing"'), 'Has root test id');
    check(html.includes('data-testid="matrix-legend"'), 'Has legend');
    check(html.includes('cell--guessed'), 'Has guessed cell CSS class');
    check(html.includes('cell--pending'), 'Has pending cell CSS class');
    check(html.includes('cell--verified-present'), 'Has verified-present cell CSS class');
    check(html.includes('cell--verified-absent'), 'Has verified-absent cell CSS class');
    check(html.includes('Guessed (candidate hub)'), 'Legend has guessed label');
    check(html.includes('Pending (verification in progress)'), 'Legend has pending label');
    check(html.includes('data-testid="flip-axes"'), 'Has flip axes button');
    check(html.includes('data-testid="matrix-table"'), 'Has matrix table');
    check(html.includes('data-testid="matrix-table-flipped"'), 'Has flipped matrix table');
    check(html.includes('data-testid="matrix-view-a"'), 'Has matrix view A wrapper');
    check(html.includes('data-testid="matrix-view-b"'), 'Has matrix view B wrapper');
    check(html.includes('data-testid="matrix-col-headers"'), 'Has column headers row');
    check(html.includes('data-testid="filters-form"'), 'Has filters form');
    check(html.includes('/cell?placeId='), 'Has drilldown cell links');

    const htmlVirtual = renderPlaceHubGuessingMatrixHtml({
      dbHandle,
      placeKind: 'country',
      pageKind: 'country-hub',
      placeLimit: 18,
      hostLimit: 16,
      matrixMode: 'virtual'
    });

    check(typeof htmlVirtual === 'string' && htmlVirtual.length > 500, 'HTML rendered (virtual)');
    check(htmlVirtual.includes('data-testid="place-hub-guessing"'), 'Has root test id (virtual)');
    check(htmlVirtual.includes('data-matrix-mode="virtual"'), 'Has data-matrix-mode=virtual');
    check(htmlVirtual.includes('data-testid="matrix-virtual"'), 'Has virtual matrix view A');
    check(htmlVirtual.includes('data-testid="matrix-virtual-flipped"'), 'Has virtual matrix view B');
    check(htmlVirtual.includes('data-testid="phg-vm-viewport-a"'), 'Has virtual viewport A');
    check(htmlVirtual.includes('data-testid="phg-vm-viewport-b"'), 'Has virtual viewport B');
    check(htmlVirtual.includes('data-vm-role="data"') && htmlVirtual.includes('data-vm-role="init"'), 'Has virtual payload + init scripts');
    check(
      htmlVirtual.includes('"path"') && htmlVirtual.includes('/cell') &&
        (htmlVirtual.includes('"rowParam":"placeId"') || htmlVirtual.includes('"colParam":"placeId"')),
      'Has drilldown config in payload (virtual)'
    );

    console.log('');
    console.log('--- HTML (truncated) ---');
    console.log(html.slice(0, 1200));
    console.log('--- /HTML (truncated) ---');

    console.log('');
    console.log(`${passed}/${passed + failed} checks passed`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Error:', err.stack || err.message);
    process.exit(2);
  } finally {
    try {
      resolved.close();
    } catch {
      // ignore
    }
  }

  process.exit(0);
}

main();
