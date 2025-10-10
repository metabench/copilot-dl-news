#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

// Simple arg parser
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const key = arg.replace(/^--/, '');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++; // skip next element
    } else {
      args[key] = true;
    }
  }
}

const outputDirArg = args['output-dir'];
const outputDir = outputDirArg ? path.resolve(repoRoot, outputDirArg) : path.join(repoRoot, 'docs', 'documentation-review');

const ignoreDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  'out',
  'tmp',
  'temp'
]);

const now = new Date();
const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

const agentsPath = path.join(repoRoot, 'AGENTS.md');
const agentsContent = fs.existsSync(agentsPath)
  ? fs.readFileSync(agentsPath, 'utf8')
  : '';

const docs = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relative = path.relative(repoRoot, fullPath);
      const posixPath = relative.split(path.sep).join('/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const stat = fs.statSync(fullPath);
      docs.push({
        path: fullPath,
        relative,
        posixPath,
        name: entry.name,
        content,
        stat
      });
    }
  }
}

walk(repoRoot);

function categorize(doc) {
  const name = doc.name.toLowerCase();
  const rel = doc.posixPath.toLowerCase();
  if (name.includes('architecture')) return 'architecture';
  if (name.includes('investigation') || name.includes('issue') || name.includes('debug')) return 'investigation';
  if (name.includes('plan') || name.includes('roadmap') || name.includes('implementation') || name.includes('phase')) return 'planning';
  if (name.includes('guide') || name === 'agents.md' || name === 'readme.md' || name.includes('runbook')) return 'reference';
  return 'feature';
}

const docContents = docs.map(d => ({ name: d.name, posixPath: d.posixPath, content: d.content }));

function countCrossReferences(target) {
  let count = 0;
  for (const doc of docContents) {
    if (doc.posixPath === target.posixPath) continue;
    if (doc.content.includes(target.posixPath) || doc.content.includes(target.name)) {
      count += 1;
    }
  }
  return count;
}

const inventory = docs.map(doc => {
  const lines = doc.content.split(/\r?\n/).length;
  const discoverable = agentsContent.includes(doc.posixPath) || agentsContent.includes(doc.name);
  const hasWhenToRead = /when to read/i.test(doc.content);
  const crossRefs = countCrossReferences(doc);
  const focused = lines <= 2000;
  const timely = now - doc.stat.mtimeMs <= ninetyDaysMs;
  const hasCode = doc.content.includes('```');
  const hasVisual = /!\[/.test(doc.content) || doc.content.split(/\r?\n/).some(line => line.trim().startsWith('|'));
  return {
    path: doc.posixPath,
    category: categorize(doc),
    lines,
    discoverable,
    hasWhenToRead,
    crossRefs,
    focused,
    timely,
    hasCode,
    hasVisual,
    lastModified: doc.stat.mtime.toISOString()
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  totalDocs: inventory.length,
  byCategory: Object.fromEntries(
    inventory.reduce((map, doc) => {
      map.set(doc.category, (map.get(doc.category) || 0) + 1);
      return map;
    }, new Map())
  ),
  discoverabilityRate: inventory.filter(doc => doc.discoverable).length / Math.max(inventory.length, 1),
  whenToReadRate: inventory.filter(doc => doc.hasWhenToRead).length / Math.max(inventory.length, 1),
  timelyRate: inventory.filter(doc => doc.timely).length / Math.max(inventory.length, 1),
  focusedRate: inventory.filter(doc => doc.focused).length / Math.max(inventory.length, 1),
  codeExampleRate: inventory.filter(doc => doc.hasCode).length / Math.max(inventory.length, 1),
  visualAidRate: inventory.filter(doc => doc.hasVisual).length / Math.max(inventory.length, 1)
};

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const timestamp = new Date().toISOString().split('T')[0];
const inventoryPath = path.join(outputDir, `${timestamp}-inventory.json`);
const summaryPath = path.join(outputDir, `${timestamp}-summary.json`);

fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log(`Documentation inventory written to ${path.relative(repoRoot, inventoryPath)}`);
console.log(`Summary written to ${path.relative(repoRoot, summaryPath)}`);

const missingInAgents = inventory.filter(doc => !doc.discoverable).sort((a, b) => a.path.localeCompare(b.path));
const orphanListPath = path.join(outputDir, `${timestamp}-missing-in-agents.md`);

const orphanLines = [
  '# Docs Missing from AGENTS.md Index',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `Total missing: ${missingInAgents.length}`,
  '',
  '| Path | Lines | Category | When to Read | Timely |',
  '| --- | ---: | --- | --- | --- |'
];
for (const doc of missingInAgents) {
  orphanLines.push(
    `| ${doc.path} | ${doc.lines} | ${doc.category} | ${doc.hasWhenToRead ? 'Yes' : 'No'} | ${doc.timely ? 'Yes' : 'No'} |`
  );
}
fs.writeFileSync(orphanListPath, orphanLines.join('\n'));
console.log(`Missing-docs report written to ${path.relative(repoRoot, orphanListPath)}`);

const needsWhenToRead = inventory.filter(doc => !doc.hasWhenToRead).sort((a, b) => b.lines - a.lines);
const whenToReadPath = path.join(outputDir, `${timestamp}-needs-when-to-read.md`);
const whenLines = [
  '# Docs Missing "When to Read" Guidance',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `Total docs without guidance: ${needsWhenToRead.length}`,
  '',
  '| Path | Lines | Category | Discoverable | Cross References |',
  '| --- | ---: | --- | --- | --- |'
];
for (const doc of needsWhenToRead) {
  whenLines.push(
    `| ${doc.path} | ${doc.lines} | ${doc.category} | ${doc.discoverable ? 'Yes' : 'No'} | ${doc.crossRefs} |`
  );
}
fs.writeFileSync(whenToReadPath, whenLines.join('\n'));
console.log(`When-to-read gap report written to ${path.relative(repoRoot, whenToReadPath)}`);

const weaklyReferenced = inventory.filter(doc => doc.crossRefs === 0).sort((a, b) => a.path.localeCompare(b.path));
const weakRefsPath = path.join(outputDir, `${timestamp}-zero-crossrefs.md`);
const weakLines = [
  '# Docs With Zero Cross References',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `Total zero-reference docs: ${weaklyReferenced.length}`,
  '',
  '| Path | Lines | Category | Discoverable | When to Read |',
  '| --- | ---: | --- | --- | --- |'
];
for (const doc of weaklyReferenced) {
  weakLines.push(
    `| ${doc.path} | ${doc.lines} | ${doc.category} | ${doc.discoverable ? 'Yes' : 'No'} | ${doc.hasWhenToRead ? 'Yes' : 'No'} |`
  );
}
fs.writeFileSync(weakRefsPath, weakLines.join('\n'));
console.log(`Zero-crossref report written to ${path.relative(repoRoot, weakRefsPath)}`);
