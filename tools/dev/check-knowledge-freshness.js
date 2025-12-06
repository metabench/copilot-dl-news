#!/usr/bin/env node
'use strict';

/**
 * check-knowledge-freshness.js: Validate documentation freshness and verification status
 * 
 * Features:
 * - Warns about stale documentation (>60 days since update)
 * - Checks for "Last Verified" metadata in satellites
 * - Validates cross-references between agents and satellites
 * - Can be run as pre-session check or in CI
 * 
 * Usage:
 *   node tools/dev/check-knowledge-freshness.js              # Full report
 *   node tools/dev/check-knowledge-freshness.js --quick      # Just show issues
 *   node tools/dev/check-knowledge-freshness.js --ci         # Exit 1 if stale docs found
 */

const fs = require('fs');
const path = require('path');

// Configuration
const AGENTS_DIR = path.join(process.cwd(), '.github', 'agents');
const GUIDES_DIR = path.join(process.cwd(), 'docs', 'guides');
const AGENTS_MD = path.join(process.cwd(), 'AGENTS.md');

// Thresholds (days)
const THRESHOLDS = {
  stale: 60,           // Doc is stale
  warning: 30,         // Doc needs attention
  verificationDue: 45, // Verification needed
  criticalStale: 90    // Critical - must verify
};

/**
 * Parse document for freshness metadata
 */
function parseDocument(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].replace(/[🧠💡⚡]/g, '').trim() : path.basename(filePath);
    
    // Extract "Last updated" date
    const lastUpdatedMatch = content.match(/_Last updated:\s*(\d{4}-\d{2}-\d{2})_/i);
    const lastUpdated = lastUpdatedMatch ? new Date(lastUpdatedMatch[1]) : stats.mtime;
    
    // Extract "Last Verified" date
    const lastVerifiedMatch = content.match(/Last Verified[:\s]*(\d{4}-\d{2}-\d{2})/i);
    const lastVerified = lastVerifiedMatch ? new Date(lastVerifiedMatch[1]) : null;
    
    // Check for verification table
    const hasVerificationTable = /\|\s*Pattern\s*\|\s*Last Verified/i.test(content);
    
    // Extract satellite references
    const satelliteRefs = [];
    const tableRowRegex = /\|\s*`([^`]+\.md)`/g;
    let match;
    while ((match = tableRowRegex.exec(content)) !== null) {
      satelliteRefs.push(match[1]);
    }
    
    // Also check for inline references
    const inlineRefRegex = /docs\/guides\/([A-Z_]+\.md)/g;
    while ((match = inlineRefRegex.exec(content)) !== null) {
      if (!satelliteRefs.includes(match[0])) {
        satelliteRefs.push(match[0]);
      }
    }
    
    // Calculate days
    const daysSinceUpdate = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceVerified = lastVerified 
      ? Math.floor((Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    return {
      filePath,
      relativePath: path.relative(process.cwd(), filePath),
      title,
      lastUpdated,
      lastVerified,
      daysSinceUpdate,
      daysSinceVerified,
      hasVerificationTable,
      satelliteRefs,
      issues: []
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check a document for issues
 */
function checkDocument(doc) {
  const issues = [];
  
  // Check staleness
  if (doc.daysSinceUpdate > THRESHOLDS.criticalStale) {
    issues.push({
      level: 'critical',
      message: `Critical: Not updated in ${doc.daysSinceUpdate} days (>${THRESHOLDS.criticalStale}d threshold)`,
      action: 'Review and verify all content is still accurate'
    });
  } else if (doc.daysSinceUpdate > THRESHOLDS.stale) {
    issues.push({
      level: 'warning',
      message: `Stale: Not updated in ${doc.daysSinceUpdate} days (>${THRESHOLDS.stale}d threshold)`,
      action: 'Consider reviewing for accuracy'
    });
  }
  
  // Check verification (for satellites)
  if (doc.relativePath.includes('docs/guides/')) {
    if (!doc.lastVerified && !doc.hasVerificationTable) {
      issues.push({
        level: 'info',
        message: 'No "Last Verified" date found',
        action: 'Add "_Last Verified: YYYY-MM-DD_" after testing patterns'
      });
    } else if (doc.daysSinceVerified !== null && doc.daysSinceVerified > THRESHOLDS.verificationDue) {
      issues.push({
        level: 'warning',
        message: `Verification due: Last verified ${doc.daysSinceVerified} days ago`,
        action: 'Re-test patterns and update verification date'
      });
    }
  }
  
  doc.issues = issues;
  return doc;
}

/**
 * Validate cross-references
 */
function validateReferences(agents, satellites) {
  const issues = [];
  const satelliteMap = new Map();
  
  for (const sat of satellites) {
    satelliteMap.set(sat.relativePath, sat);
    satelliteMap.set(path.basename(sat.filePath), sat);
  }
  
  for (const agent of agents) {
    for (const ref of agent.satelliteRefs) {
      const refPath = ref.replace(/^docs\/guides\//, '');
      if (!satelliteMap.has(ref) && !satelliteMap.has(refPath) && !satelliteMap.has(path.basename(ref))) {
        issues.push({
          agent: agent.relativePath,
          reference: ref,
          message: `Broken reference: ${ref} not found in docs/guides/`
        });
      }
    }
  }
  
  return issues;
}

/**
 * Print report
 */
function printReport(documents, referenceIssues, options = {}) {
  const { quick, ci } = options;
  
  console.log('\n' + '═'.repeat(70));
  console.log('  📚 Knowledge Freshness & Verification Report');
  console.log('═'.repeat(70));
  
  const allDocs = documents.filter(Boolean);
  const docsWithIssues = allDocs.filter(d => d.issues.length > 0);
  const criticalDocs = allDocs.filter(d => d.issues.some(i => i.level === 'critical'));
  const warningDocs = allDocs.filter(d => d.issues.some(i => i.level === 'warning'));
  
  // Summary
  console.log(`\n  📊 Summary: ${allDocs.length} documents scanned`);
  console.log(`     🔴 Critical: ${criticalDocs.length}`);
  console.log(`     🟡 Warnings: ${warningDocs.length}`);
  console.log(`     🔗 Broken refs: ${referenceIssues.length}`);
  
  if (criticalDocs.length === 0 && warningDocs.length === 0 && referenceIssues.length === 0) {
    console.log('\n  ✅ All documentation is fresh and verified!\n');
    return 0;
  }
  
  // Critical issues
  if (criticalDocs.length > 0) {
    console.log('\n  🔴 CRITICAL - Immediate attention required:\n');
    for (const doc of criticalDocs) {
      console.log(`     ${doc.title}`);
      console.log(`     └─ ${doc.relativePath}`);
      for (const issue of doc.issues.filter(i => i.level === 'critical')) {
        console.log(`        ⚠️  ${issue.message}`);
        if (!quick) console.log(`        💡 ${issue.action}`);
      }
      console.log();
    }
  }
  
  // Warning issues
  if (warningDocs.length > 0) {
    console.log('\n  🟡 WARNINGS - Review recommended:\n');
    for (const doc of warningDocs) {
      console.log(`     ${doc.title}`);
      console.log(`     └─ ${doc.relativePath}`);
      for (const issue of doc.issues.filter(i => i.level === 'warning')) {
        console.log(`        ⚠️  ${issue.message}`);
        if (!quick) console.log(`        💡 ${issue.action}`);
      }
      console.log();
    }
  }
  
  // Reference issues
  if (referenceIssues.length > 0) {
    console.log('\n  🔗 BROKEN REFERENCES:\n');
    for (const issue of referenceIssues) {
      console.log(`     ${issue.agent}`);
      console.log(`     └─ Missing: ${issue.reference}`);
      console.log();
    }
  }
  
  // Suggestions
  if (!quick) {
    console.log('\n  💡 Suggestions:\n');
    console.log('     1. For stale docs: Review content, update examples, add "_Last updated: YYYY-MM-DD_"');
    console.log('     2. For unverified patterns: Test the code examples, add verification date');
    console.log('     3. For broken refs: Update the reference path or remove if obsolete');
    console.log('     4. Run `node tools/dev/knowledge-graph.js` to visualize relationships\n');
  }
  
  console.log('═'.repeat(70) + '\n');
  
  // Return exit code for CI
  return (ci && (criticalDocs.length > 0 || referenceIssues.length > 0)) ? 1 : 0;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const options = {
    quick: args.includes('--quick'),
    ci: args.includes('--ci'),
    json: args.includes('--json')
  };
  
  const documents = [];
  
  // Scan agents
  if (fs.existsSync(AGENTS_DIR)) {
    const agentFiles = fs.readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(AGENTS_DIR, f));
    
    for (const file of agentFiles) {
      const doc = parseDocument(file);
      if (doc) {
        documents.push(checkDocument(doc));
      }
    }
  }
  
  // Scan satellites
  if (fs.existsSync(GUIDES_DIR)) {
    const guideFiles = fs.readdirSync(GUIDES_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(GUIDES_DIR, f));
    
    for (const file of guideFiles) {
      const doc = parseDocument(file);
      if (doc) {
        documents.push(checkDocument(doc));
      }
    }
  }
  
  // Scan AGENTS.md
  if (fs.existsSync(AGENTS_MD)) {
    const doc = parseDocument(AGENTS_MD);
    if (doc) {
      documents.push(checkDocument(doc));
    }
  }
  
  // Validate references
  const agents = documents.filter(d => d.relativePath.includes('.github/agents'));
  const satellites = documents.filter(d => d.relativePath.includes('docs/guides'));
  const referenceIssues = validateReferences(agents, satellites);
  
  if (options.json) {
    console.log(JSON.stringify({
      scanned: documents.length,
      issues: documents.filter(d => d.issues.length > 0).map(d => ({
        path: d.relativePath,
        title: d.title,
        daysSinceUpdate: d.daysSinceUpdate,
        daysSinceVerified: d.daysSinceVerified,
        issues: d.issues
      })),
      brokenReferences: referenceIssues
    }, null, 2));
    return;
  }
  
  const exitCode = printReport(documents, referenceIssues, options);
  process.exitCode = exitCode;
}

if (require.main === module) {
  main();
}

module.exports = {
  parseDocument,
  checkDocument,
  validateReferences,
  THRESHOLDS
};
