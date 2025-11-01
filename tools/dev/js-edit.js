#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { parseModule, collectFunctions, extractCode, replaceSpan } = require('./lib/swcAst');

const fmt = new CliFormatter();

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'js-edit',
    'Inspect and edit JavaScript functions using SWC AST tooling.'
  );

  parser
    .add('--file <path>', 'JavaScript file to inspect or modify')
    .add('--list-functions', 'List detected functions', false, 'boolean')
    .add('--extract <name>', 'Extract the specified function by name')
    .add('--replace <name>', 'Replace the specified function by name')
    .add('--with <path>', 'Replacement source snippet for --replace')
    .add('--output <path>', 'Write extracted function to this file instead of stdout')
    .add('--emit-diff', 'Show before/after snippets for replacements', false, 'boolean')
    .add('--fix', 'Apply changes to the target file (default is dry-run)', false, 'boolean')
    .add('--json', 'Emit JSON output instead of formatted text', false, 'boolean')
    .add('--quiet', 'Suppress formatted output (implies --json)', false, 'boolean')
    .add('--benchmark', 'Measure parse time for the input file', false, 'boolean');

  return parser.parse(argv);
}

function normalizeOptions(raw) {
  const resolved = { ...raw };
  if (!resolved.file) {
    throw new Error('Missing required option: --file <path>');
  }

  const filePath = path.isAbsolute(resolved.file)
    ? resolved.file
    : path.resolve(process.cwd(), resolved.file);

  const operations = [Boolean(resolved.listFunctions), Boolean(resolved.extract), Boolean(resolved.replace)].filter(Boolean);
  if (operations.length === 0) {
    throw new Error('Provide one of --list-functions, --extract <name>, or --replace <name>.');
  }
  if (operations.length > 1) {
    throw new Error('Only one operation may be specified at a time. Choose one of --list-functions, --extract, or --replace.');
  }

  const json = Boolean(resolved.json || resolved.quiet);
  const quiet = Boolean(resolved.quiet);
  const emitDiff = Boolean(resolved.emitDiff);
  const benchmark = Boolean(resolved.benchmark);
  const fix = Boolean(resolved.fix);

  let extractName = null;
  if (resolved.extract) {
    extractName = String(resolved.extract).trim();
    if (!extractName) {
      throw new Error('Provide a non-empty name for --extract.');
    }
  }

  let replaceName = null;
  let replacementPath = null;
  if (resolved.replace) {
    replaceName = String(resolved.replace).trim();
    if (!replaceName) {
      throw new Error('Provide a non-empty name for --replace.');
    }
    if (!resolved.with) {
      throw new Error('Replacing a function requires --with <path> containing the replacement source.');
    }
    replacementPath = path.isAbsolute(resolved.with)
      ? resolved.with
      : path.resolve(process.cwd(), resolved.with);
  }

  let outputPath = null;
  if (resolved.output) {
    outputPath = path.isAbsolute(resolved.output)
      ? resolved.output
      : path.resolve(process.cwd(), resolved.output);
  }

  return {
    filePath,
    list: Boolean(resolved.listFunctions),
    extractName,
    replaceName,
    replacementPath,
    outputPath,
    emitDiff,
    json,
    quiet,
    benchmark,
    fix
  };
}

function readSource(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}\n${error.message}`);
  }
}

function loadReplacementSource(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read replacement snippet: ${filePath}\n${error.message}`);
  }
}

function findFunctionByName(functions, name) {
  const matches = functions.filter((fn) => fn.name === name);
  if (matches.length === 0) {
    throw new Error(`No function named "${name}" was found.`);
  }
  if (matches.length > 1) {
    const locations = matches.map((fn) => `${fn.name} (${fn.kind}) @ ${fn.line}:${fn.column}`).join('\n  - ');
    throw new Error(`Multiple matches found for "${name}". Refine your search.\n  - ${locations}`);
  }
  return matches[0];
}

function writeOutputFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function outputJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function listFunctions({ filePath, json, quiet }, source, functions) {
  const payload = {
    file: filePath,
    totalFunctions: functions.length,
    functions: functions.map((fn) => ({
      name: fn.name,
      kind: fn.kind,
      exportKind: fn.exportKind,
      replaceable: fn.replaceable,
      line: fn.line,
      column: fn.column
    }))
  };

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Function Inventory');
    if (functions.length === 0) {
      fmt.warn('No functions detected in the supplied file.');
      return;
    }

    fmt.section('Detected Functions');
    fmt.table(functions.map((fn) => ({
      name: fn.name,
      kind: fn.kind,
      export: fn.exportKind || '-',
      line: fn.line,
      column: fn.column,
      replaceable: fn.replaceable ? 'yes' : 'no'
    })), {
      columns: ['name', 'kind', 'export', 'line', 'column', 'replaceable']
    });
    fmt.stat('Total functions', functions.length, 'number');
    fmt.footer();
  }
}

function extractFunction({ filePath, outputPath, json, quiet }, source, functions, name) {
  const match = findFunctionByName(functions, name);
  const snippet = extractCode(source, match.span);

  const payload = {
    file: filePath,
    function: {
      name: match.name,
      kind: match.kind,
      line: match.line,
      column: match.column,
      exportKind: match.exportKind,
      replaceable: match.replaceable
    },
    code: snippet
  };

  if (outputPath) {
    writeOutputFile(outputPath, snippet);
  }

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Function Extract');
    fmt.section(`Function: ${match.name}`);
    fmt.stat('Kind', match.kind);
    fmt.stat('Location', `${match.line}:${match.column}`);
    if (match.exportKind) fmt.stat('Exported As', match.exportKind);
    if (outputPath) {
      fmt.stat('Written to', outputPath);
    }
    fmt.section('Source');
    process.stdout.write(`${snippet}\n`);
    fmt.footer();
  }
}

function replaceFunction(options, source, functions, name, replacementPath) {
  const match = findFunctionByName(functions, name);
  if (!match.replaceable) {
    throw new Error(`Function "${name}" is not currently replaceable (only standard function declarations and default exports are supported).`);
  }

  const replacement = loadReplacementSource(replacementPath);
  const trimmedReplacement = replacement.endsWith('\n') ? replacement : `${replacement}\n`;
  const newSource = replaceSpan(source, match.span, trimmedReplacement);
  const snippetBefore = extractCode(source, match.span);

  try {
    parseModule(newSource, options.filePath);
  } catch (error) {
    throw new Error(`Replacement produced invalid JavaScript: ${error.message}`);
  }

  const payload = {
    file: options.filePath,
    function: {
      name: match.name,
      kind: match.kind,
      line: match.line,
      column: match.column,
      exportKind: match.exportKind
    },
    applied: Boolean(options.fix)
  };

  if (options.emitDiff) {
    payload.diff = {
      before: snippetBefore,
      after: trimmedReplacement
    };
  }

  if (options.fix) {
    writeOutputFile(options.filePath, newSource);
  }

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (!options.quiet) {
    fmt.header('Function Replacement');
    fmt.section(`Function: ${match.name}`);
    fmt.stat('Kind', match.kind);
    fmt.stat('Location', `${match.line}:${match.column}`);
    fmt.stat('Mode', options.fix ? 'applied' : 'dry-run');
    if (options.emitDiff) {
      fmt.section('Original');
      process.stdout.write(`${snippetBefore}\n`);
      fmt.section('Replacement');
      process.stdout.write(`${trimmedReplacement}\n`);
    }
    if (!options.fix) {
      fmt.warn('Dry-run: no changes were written. Re-run with --fix to apply.');
    } else {
      fmt.success(`Updated ${options.filePath}`);
    }
    fmt.footer();
  }
}

function measureParse(source, filePath) {
  const start = process.hrtime.bigint();
  const ast = parseModule(source, filePath);
  const durationNs = Number(process.hrtime.bigint() - start);
  return { ast, durationMs: durationNs / 1_000_000 };
}

function main(argv) {
  try {
    const rawOptions = parseCliArgs(argv);
    const options = normalizeOptions(rawOptions);
    const source = readSource(options.filePath);

    const { ast, durationMs } = options.benchmark
      ? measureParse(source, options.filePath)
      : { ast: parseModule(source, options.filePath), durationMs: null };

    const { functions } = collectFunctions(ast, source);

    if (options.benchmark && !options.json && !options.quiet) {
      fmt.info(`Parse time: ${durationMs.toFixed(2)} ms`);
    }

    if (options.list) {
      listFunctions(options, source, functions);
    } else if (options.extractName) {
      extractFunction(options, source, functions, options.extractName);
    } else if (options.replaceName) {
      replaceFunction(options, source, functions, options.replaceName, options.replacementPath);
    }
  } catch (error) {
    fmt.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv);
}
