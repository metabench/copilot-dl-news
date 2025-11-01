const { parseSync } = require('@swc/core');

function parseModule(source, fileName = 'anonymous.js') {
  return parseSync(source, {
    syntax: 'ecmascript',
    jsx: true,
    dynamicImport: true,
    privateMethod: true,
    functionBind: true,
    decorators: false,
    importAssertions: true,
    target: 'es2022',
    comments: true,
    script: false,
    isModule: true,
    preserveAllComments: true,
    topLevelAwait: true,
    fileName
  });
}

function buildLineIndex(source) {
  const index = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') {
      index.push(i + 1);
    }
  }
  return index;
}

function normalizeSpan(span) {
  if (!span) return { start: 0, end: 0 };
  if (typeof span.start === 'number' && typeof span.end === 'number') {
    return {
      start: Math.max(0, span.start - 1),
      end: Math.max(0, span.end)
    };
  }
  if (typeof span.lo === 'number' && typeof span.hi === 'number') {
    return {
      start: Math.max(0, span.lo - 1),
      end: Math.max(0, span.hi)
    };
  }
  return { start: 0, end: 0 };
}

function offsetToPosition(lineIndex, offset) {
  if (offset < 0) {
    return { line: 1, column: 1 };
  }

  let low = 0;
  let high = lineIndex.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = lineIndex[mid];
    if (value <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const line = high + 1;
  const columnBase = lineIndex[high] ?? 0;
  return {
    line,
    column: offset - columnBase + 1
  };
}

function recordFunction(results, source, meta) {
  const { span } = meta;
  const normalizedSpan = normalizeSpan(span);
  const lineIndex = meta.lineIndex;
  const position = offsetToPosition(lineIndex, normalizedSpan.start);

  results.push({
    name: meta.name,
    kind: meta.kind,
    exportKind: meta.exportKind,
    replaceable: meta.replaceable === true,
    span: normalizedSpan,
    line: position.line,
    column: position.column
  });
}

function collectFunctions(ast, source) {
  const lineIndex = buildLineIndex(source);
  const functions = [];

  function visit(node, context = {}) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const { type } = node;
    if (!type) return;

    switch (type) {
      case 'Module':
        if (Array.isArray(node.body)) {
          for (const item of node.body) {
            visit(item, context);
          }
        }
        return;
      case 'FunctionDeclaration': {
        const name = node.identifier ? node.identifier.value : context.exportKind === 'default' ? 'default' : '(anonymous)';
        recordFunction(functions, source, {
          name,
          kind: 'function-declaration',
          exportKind: context.exportKind || null,
          replaceable: true,
          span: node.span,
          lineIndex
        });
        if (node.body) visit(node.body, context);
        break;
      }
      case 'ExportDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          visit(decl, { ...context, exportKind: 'named' });
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          visit(decl, { ...context, exportKind: 'default' });
        }
        break;
      }
      case 'ExportDefaultExpression': {
        if (node.expression && (node.expression.type === 'FunctionExpression' || node.expression.type === 'ArrowFunctionExpression')) {
          recordFunction(functions, source, {
            name: 'default',
            kind: node.expression.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
            exportKind: 'default',
            replaceable: true,
            span: node.expression.span,
            lineIndex
          });
        }
        visit(node.expression, { ...context, exportKind: 'default' });
        break;
      }
      case 'VariableDeclaration': {
        if (Array.isArray(node.declarations)) {
          for (const decl of node.declarations) {
            visit(decl, context);
          }
        }
        break;
      }
      case 'VariableDeclarator': {
        const id = node.id;
        const init = node.init;
        if (id && id.type === 'Identifier' && init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
          recordFunction(functions, source, {
            name: id.value,
            kind: init.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
            exportKind: context.exportKind || null,
            replaceable: false,
            span: init.span || node.span,
            lineIndex
          });
        }
        if (init) visit(init, context);
        break;
      }
      case 'FunctionExpression': {
        if (context.exportKind && node.identifier) {
          recordFunction(functions, source, {
            name: node.identifier.value,
            kind: 'function-expression',
            exportKind: context.exportKind,
            replaceable: true,
            span: node.span,
            lineIndex
          });
        }
        if (node.body) visit(node.body, context);
        break;
      }
      case 'ClassDeclaration': {
        if (node.identifier) {
          recordFunction(functions, source, {
            name: node.identifier.value,
            kind: 'class',
            exportKind: context.exportKind || null,
            replaceable: false,
            span: node.span,
            lineIndex
          });
        }
        if (node.body && Array.isArray(node.body.body)) {
          for (const member of node.body.body) {
            visit(member, { ...context, className: node.identifier ? node.identifier.value : null });
          }
        }
        break;
      }
      case 'ClassMethod':
      case 'ClassPrivateMethod': {
        if (node.key && node.key.type === 'Identifier') {
          recordFunction(functions, source, {
            name: context.className ? `${context.className}.${node.key.value}` : node.key.value,
            kind: 'class-method',
            exportKind: context.exportKind || null,
            replaceable: false,
            span: node.span,
            lineIndex
          });
        }
        if (node.function) visit(node.function, context);
        break;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === 'span') continue;
          const value = node[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              visit(child, context);
            }
          } else if (value && typeof value === 'object') {
            visit(value, context);
          }
        }
      }
    }
  }

  visit(ast, {});

  functions.sort((a, b) => a.span.start - b.span.start);
  return { functions, lineIndex };
}

function extractCode(source, span) {
  const { start, end } = normalizeSpan(span);
  return source.slice(start, end);
}

function replaceSpan(source, span, replacement) {
  const { start, end } = normalizeSpan(span);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

module.exports = {
  parseModule,
  collectFunctions,
  extractCode,
  replaceSpan,
  normalizeSpan
};
