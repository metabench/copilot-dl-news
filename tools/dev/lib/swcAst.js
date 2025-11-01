const { parseSync } = require('@swc/core');
const crypto = require('crypto');

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

function buildCanonicalName(name, scopeChain, exportKind) {
  const chain = Array.isArray(scopeChain) ? scopeChain : [];
  if (chain.length > 0) {
    if (chain[0] === 'exports') {
      if (chain.length >= 2) {
        const base = `exports.${chain[1]}`;
        const rest = chain.slice(2);
        if (rest.length > 0) {
          return `${base} > ${rest.join(' > ')}`;
        }
        return base;
      }
      return `exports.${name || 'default'}`;
    }

    if (chain.length >= 2) {
      const owner = chain[0];
      const marker = chain[1];
      const tail = chain.slice(2);
      if (typeof marker === 'string' && marker.startsWith('#')) {
        const suffix = tail.length > 0 ? ` > ${tail.join(' > ')}` : '';
        return `${owner}${marker}${suffix}`;
      }
      if (marker === 'static' || marker === 'get' || marker === 'set') {
        const primary = (tail[0] || name || '').trim();
        const remaining = tail.length > 1 ? ` > ${tail.slice(1).join(' > ')}` : '';
        const label = primary ? `${owner}.${marker} ${primary}` : `${owner}.${marker}`;
        return `${label}${remaining}`;
      }
    }

    return chain.join(' > ');
  }

  if (exportKind === 'default') {
    return 'exports.default';
  }
  if (exportKind === 'named') {
    return `exports.${name}`;
  }
  return name;
}

function buildPathSignature(pathSegments, nodeType) {
  const segments = Array.isArray(pathSegments) ? pathSegments.slice() : [];
  if (nodeType) {
    segments.push(nodeType);
  }
  return segments.join('.');
}

function computeHash(source, span) {
  const { start, end } = normalizeSpan(span);
  const snippet = source.slice(start, end);
  return crypto.createHash('sha256').update(snippet).digest('hex');
}

function recordFunction(results, source, meta) {
  const normalizedSpan = normalizeSpan(meta.span);
  const position = offsetToPosition(meta.lineIndex, normalizedSpan.start);

  const scopeChain = Array.isArray(meta.scopeChain) ? meta.scopeChain.slice() : [];
  const canonicalName = buildCanonicalName(meta.name, scopeChain, meta.exportKind);
  const pathSignature = buildPathSignature(meta.pathSegments, meta.nodeType);
  const hash = computeHash(source, normalizedSpan);
  const identifierSpan = meta.identifierSpan ? normalizeSpan(meta.identifierSpan) : null;


  results.push({
    name: meta.name,
    canonicalName,
    scopeChain,
    kind: meta.kind,
    exportKind: meta.exportKind,
    replaceable: meta.replaceable === true,
    span: normalizedSpan,
    line: position.line,
    column: position.column,
    hash,
    pathSignature,
    pathSegments: Array.isArray(meta.pathSegments) ? meta.pathSegments.slice() : [],
    identifierSpan
  });
}

function extendScopeChain(scopeChain, additions = []) {
  const base = Array.isArray(scopeChain) ? scopeChain : [];
  return base.concat(additions);
}

function ensureIdentifierName(key) {
  if (!key) return '[anonymous]';
  if (key.type === 'Identifier' && key.value) return key.value;
  if (key.type === 'PrivateName' && key.id && key.id.name) return `#${key.id.name}`;
  if (key.type === 'StringLiteral' && key.value) return key.value;
  return '[computed]';
}

function collectFunctions(ast, source) {
  const lineIndex = buildLineIndex(source);
  const functions = [];

  function visit(node, context = { scopeChain: [], exportKind: null }, pathSegments = ['module']) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const { type } = node;
    if (!type) return;

    const includeType = !(type === 'Module' && pathSegments.length === 1 && pathSegments[0] === 'module');
    const currentPath = includeType ? pathSegments.concat(type) : pathSegments;
    const currentScope = Array.isArray(context.scopeChain) ? context.scopeChain : [];

    switch (type) {
      case 'Module': {
        if (Array.isArray(node.body)) {
          node.body.forEach((item, index) => {
            visit(item, context, currentPath.concat(`body[${index}]`));
          });
        }
        return;
      }
      case 'FunctionDeclaration': {
        const name = node.identifier ? node.identifier.value : context.exportKind === 'default' ? 'default' : '(anonymous)';
        const shouldAppendName = currentScope.length > 0 && currentScope[currentScope.length - 1] !== name;
        const scopeChain = extendScopeChain(currentScope, shouldAppendName ? [name] : []);
        recordFunction(functions, source, {
          name,
          kind: 'function-declaration',
          exportKind: context.exportKind || null,
          replaceable: true,
          span: node.span,
          lineIndex,
          scopeChain,
          pathSegments: currentPath,
          nodeType: type,
          identifierSpan: node.identifier ? node.identifier.span : null
        });
        if (node.body) {
          const childScope = extendScopeChain(scopeChain, shouldAppendName ? [] : [name]);
          visit(node.body, { ...context, scopeChain: childScope }, currentPath.concat('body'));
        }
        break;
      }
      case 'ExportDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports']);
          visit(decl, { ...context, exportKind: 'named', scopeChain: exportScope }, currentPath.concat('declaration'));
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
          visit(decl, { ...context, exportKind: 'default', scopeChain: exportScope }, currentPath.concat('declaration'));
        }
        break;
      }
      case 'ExportDefaultExpression': {
        const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
        if (node.expression && (node.expression.type === 'FunctionExpression' || node.expression.type === 'ArrowFunctionExpression')) {
          recordFunction(functions, source, {
            name: 'default',
            kind: node.expression.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
            exportKind: 'default',
            replaceable: true,
            span: node.expression.span,
            lineIndex,
            scopeChain: exportScope,
            pathSegments: currentPath,
            nodeType: node.expression.type,
            identifierSpan: node.expression.identifier ? node.expression.identifier.span : null
          });
        }
        if (node.expression) {
          visit(node.expression, { ...context, exportKind: 'default', scopeChain: exportScope }, currentPath.concat('expression'));
        }
        break;
      }
      case 'VariableDeclaration': {
        if (Array.isArray(node.declarations)) {
          node.declarations.forEach((decl, index) => {
            visit(decl, context, currentPath.concat(`declarations[${index}]`));
          });
        }
        break;
      }
      case 'VariableDeclarator': {
        const id = node.id;
        const init = node.init;
        if (id && id.type === 'Identifier' && init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
          const shouldAppendName = currentScope.length > 0 && currentScope[currentScope.length - 1] !== id.value;
          const scopeChain = extendScopeChain(currentScope, shouldAppendName ? [id.value] : []);
          recordFunction(functions, source, {
            name: id.value,
            kind: init.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
            exportKind: context.exportKind || null,
            replaceable: false,
            span: init.span || node.span,
            lineIndex,
            scopeChain,
            pathSegments: currentPath,
            nodeType: init.type
          });
        }
        if (init) {
          visit(init, context, currentPath.concat('init'));
        }
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
            lineIndex,
            scopeChain: extendScopeChain(currentScope, []),
            pathSegments: currentPath,
            nodeType: type,
            identifierSpan: node.identifier ? node.identifier.span : null
          });
        }
        if (node.body) {
          const funcScope = node.identifier ? extendScopeChain(currentScope, [node.identifier.value]) : currentScope;
          visit(node.body, { ...context, scopeChain: funcScope }, currentPath.concat('body'));
        }
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
            lineIndex,
            scopeChain: extendScopeChain(currentScope, []),
            pathSegments: currentPath,
            nodeType: type
          });
        }
        const className = node.identifier ? node.identifier.value : '(anonymous class)';
        const classScope = node.identifier ? extendScopeChain(currentScope, [className]) : currentScope;
        const members = Array.isArray(node.body)
          ? node.body
          : Array.isArray(node.body?.body)
            ? node.body.body
            : [];
        members.forEach((member, index) => {
          visit(member, { ...context, className, scopeChain: classScope }, currentPath.concat(`body[${index}]`));
        });
        break;
      }
      case 'ClassMethod':
      case 'ClassPrivateMethod': {
        const methodName = ensureIdentifierName(node.key);
        const cleanName = methodName.replace(/^#/, '');
        const methodSegments = [];
        if (node.kind === 'getter') {
          methodSegments.push('get', cleanName);
        } else if (node.kind === 'setter') {
          methodSegments.push('set', cleanName);
        } else if (node.isStatic) {
          methodSegments.push('static', cleanName);
        } else {
          methodSegments.push(`#${cleanName}`);
        }
        const scopeChain = extendScopeChain(currentScope, methodSegments);
        recordFunction(functions, source, {
          name: context.className ? `${context.className}.${cleanName}` : cleanName,
          kind: 'class-method',
          exportKind: context.exportKind || null,
          replaceable: false,
          span: node.span,
          lineIndex,
          scopeChain,
          pathSegments: currentPath,
          nodeType: type
        });
        if (node.function && node.function.body) {
          visit(node.function.body, { ...context, scopeChain }, currentPath.concat('function.body'));
        }
        break;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === 'span') continue;
          const value = node[key];
          if (Array.isArray(value)) {
            value.forEach((child, index) => {
              visit(child, context, currentPath.concat(`${key}[${index}]`));
            });
          } else if (value && typeof value === 'object') {
            visit(value, context, currentPath.concat(key));
          }
        }
      }
    }
  }

  visit(ast, { scopeChain: [], exportKind: null }, ['module']);

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
