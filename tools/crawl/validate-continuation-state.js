#!/usr/bin/env node
'use strict';

/**
 * validate-continuation-state.js
 *
 * Read-only invariant checker for the recursive-prompting Execution State block.
 *
 * The recursive crawler-reliability loop stores its authoritative execution
 * state either as `EXECUTION_STATE.json` next to `CONTINUATION_PROMPT.md`, or
 * as a fenced ```json block under a `## Execution State` heading inside the
 * prompt for older handoffs. As `completed_nodes` grows turn-over-turn it
 * becomes easy to introduce silent drift (active_node missing from pending, a
 * node in both completed and pending, a duplicate, malformed JSON). This script
 * parses that state and asserts the structural invariants so each turn's
 * verification ladder can catch drift before it compounds.
 *
 * Usage:
 *   node tools/crawl/validate-continuation-state.js [--file <path>] [--state-file <path>] [--json] [--max-lines <n>]
 *
 * Exit code 0 = all invariants hold; 1 = at least one violation (or parse error).
 * The `--max-lines` growth guard (default 800) emits a non-fatal warning when
 * the prompt file is large enough that the recursive loop should action the
 * `split_execution_state_to_standalone_file_if_growth_warrants` node. Warnings
 * never change the exit code so a green loop stays green.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'sessions',
  '2026-05-29-crawler-reliability-recursive-plan',
  'CONTINUATION_PROMPT.md'
);
const DEFAULT_STATE_FILE = path.join(
  path.dirname(DEFAULT_FILE),
  'EXECUTION_STATE.json'
);

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE, stateFile: null, json: false, maxLines: 800 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') args.json = true;
    else if (token === '--file') {
      args.file = argv[i + 1];
      i += 1;
    } else if (token === '--state-file') {
      args.stateFile = argv[i + 1];
      i += 1;
    } else if (token === '--max-lines') {
      args.maxLines = Number(argv[i + 1]);
      i += 1;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

/**
 * Extract the first fenced ```json block that appears after the
 * `## Execution State` heading.
 * @param {string} markdown
 * @returns {string|null} raw JSON text, or null if not found
 */
function extractExecutionStateJson(markdown) {
  const headingIdx = markdown.indexOf('## Execution State');
  if (headingIdx === -1) return null;
  const rest = markdown.slice(headingIdx);
  const fenceMatch = rest.match(/```json\s*([\s\S]*?)```/);
  return fenceMatch ? fenceMatch[1].trim() : null;
}

/**
 * Compute structural violations for the execution-state object.
 * @param {object} state
 * @returns {string[]} list of violation messages (empty = valid)
 */
function findViolations(state) {
  const violations = [];
  const isArrayOfStrings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

  if (typeof state.active_node !== 'string' || state.active_node.length === 0) {
    violations.push('active_node must be a non-empty string');
  }
  if (!isArrayOfStrings(state.completed_nodes)) {
    violations.push('completed_nodes must be an array of strings');
  }
  if (!isArrayOfStrings(state.pending_nodes)) {
    violations.push('pending_nodes must be an array of strings');
  }
  if (!(state.blocked_on === null || typeof state.blocked_on === 'string')) {
    violations.push('blocked_on must be null or a string');
  }

  // Stop here if the core arrays are malformed — later checks would be noise.
  if (violations.length > 0) return violations;

  const completed = state.completed_nodes;
  const pending = state.pending_nodes;

  if (pending.length === 0) {
    violations.push('pending_nodes is empty (no active node to execute)');
  } else if (pending[0] !== state.active_node) {
    violations.push(
      `active_node ("${state.active_node}") must equal pending_nodes[0] ("${pending[0]}")`
    );
  }

  const dupes = (arr) => {
    const seen = new Set();
    const dup = new Set();
    for (const x of arr) {
      if (seen.has(x)) dup.add(x);
      seen.add(x);
    }
    return [...dup];
  };

  const completedDupes = dupes(completed);
  if (completedDupes.length > 0) {
    violations.push(`completed_nodes has duplicates: ${completedDupes.join(', ')}`);
  }
  const pendingDupes = dupes(pending);
  if (pendingDupes.length > 0) {
    violations.push(`pending_nodes has duplicates: ${pendingDupes.join(', ')}`);
  }

  const completedSet = new Set(completed);
  const overlap = pending.filter((x) => completedSet.has(x));
  if (overlap.length > 0) {
    violations.push(`nodes appear in both completed and pending: ${overlap.join(', ')}`);
  }

  return violations;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/crawl/validate-continuation-state.js [--file <path>] [--state-file <path>] [--json] [--max-lines <n>]\n'
    );
    process.exitCode = 0;
    return;
  }

  let markdown = '';
  try {
    markdown = fs.readFileSync(args.file, 'utf8');
  } catch (err) {
    if (!args.stateFile) {
      emit(args.json, { ok: false, error: `cannot read file: ${err.message}`, file: args.file });
      process.exitCode = 1;
      return;
    }
  }

  const stateFile = args.stateFile || (fs.existsSync(DEFAULT_STATE_FILE) ? DEFAULT_STATE_FILE : null);
  let rawJson = null;
  let source = args.file;
  if (stateFile) {
    try {
      rawJson = fs.readFileSync(stateFile, 'utf8').trim();
      source = stateFile;
    } catch (err) {
      emit(args.json, { ok: false, error: `cannot read state file: ${err.message}`, file: stateFile });
      process.exitCode = 1;
      return;
    }
  } else {
    rawJson = extractExecutionStateJson(markdown);
    if (!rawJson) {
      emit(args.json, {
        ok: false,
        error: 'no state file and no ```json block found under "## Execution State"',
        file: args.file
      });
      process.exitCode = 1;
      return;
    }
  }

  let state;
  try {
    state = JSON.parse(rawJson);
  } catch (err) {
    emit(args.json, { ok: false, error: `execution-state JSON did not parse: ${err.message}`, file: source });
    process.exitCode = 1;
    return;
  }

  const violations = findViolations(state);
  const ok = violations.length === 0;
  const lineCount = markdown.split('\n').length;
  const warnings = [];
  if (Number.isFinite(args.maxLines) && args.maxLines > 0 && lineCount > args.maxLines) {
    warnings.push(
      `prompt is ${lineCount} lines (> ${args.maxLines}); action ` +
        '`split_execution_state_to_standalone_file_if_growth_warrants` to keep the handoff readable'
    );
  }
  emit(args.json, {
    ok,
    file: args.file,
    state_file: stateFile,
    state_source: source,
    active_node: state.active_node,
    completed_count: Array.isArray(state.completed_nodes) ? state.completed_nodes.length : null,
    pending_count: Array.isArray(state.pending_nodes) ? state.pending_nodes.length : null,
    line_count: lineCount,
    max_lines: args.maxLines,
    warnings,
    violations
  });
  process.exitCode = ok ? 0 : 1;
}

function emit(asJson, payload) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (payload.error) {
    process.stdout.write(`FAIL: ${payload.error}\n`);
    return;
  }
  if (payload.ok) {
    process.stdout.write(
      `OK: execution state valid (active_node="${payload.active_node}", ` +
        `${payload.completed_count} completed, ${payload.pending_count} pending)\n`
    );
  } else {
    process.stdout.write(`FAIL: ${payload.violations.length} invariant violation(s):\n`);
    for (const v of payload.violations) process.stdout.write(`  - ${v}\n`);
  }
  if (Array.isArray(payload.warnings)) {
    for (const w of payload.warnings) process.stdout.write(`WARN: ${w}\n`);
  }
}

module.exports = { extractExecutionStateJson, findViolations };

if (require.main === module) {
  main();
}
