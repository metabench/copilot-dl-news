const { parseSync } = require('@swc/core');
const crypto = require('crypto');

const HASH_PRIMARY_ENCODING = 'base64';
const HASH_FALLBACK_ENCODING = 'hex';
const HASH_LENGTH_BY_ENCODING = Object.freeze({
  base64: 8,
  hex: 12
});

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

    if (chain[0] === 'module.exports') {
      if (chain.length >= 2) {
        return `module.exports.${chain.slice(1).join('.')}`;
      }
      return 'module.exports';
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
  if (exportKind === 'commonjs-default') {
    return 'module.exports';
  }
  if (exportKind === 'commonjs-named') {
    if (Array.isArray(scopeChain) && scopeChain[0] === 'module.exports' && scopeChain.length > 1) {
      return `module.exports.${scopeChain.slice(1).join('.')}`;
    }
    if (Array.isArray(scopeChain) && scopeChain[0] === 'exports' && scopeChain.length > 1) {
      return `exports.${scopeChain.slice(1).join('.')}`;
    }
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

function createDigest(text, encoding = HASH_PRIMARY_ENCODING) {
  const digestEncoding = HASH_LENGTH_BY_ENCODING[encoding] ? encoding : HASH_FALLBACK_ENCODING;
  const digest = crypto.createHash('sha256').update(text).digest(digestEncoding);
  const sliceLength = HASH_LENGTH_BY_ENCODING[digestEncoding] || digest.length;
  return digest.slice(0, sliceLength);
}

function computeHash(source, span, encoding = HASH_PRIMARY_ENCODING) {
  const { start, end } = normalizeSpan(span);
  const snippet = source.slice(start, end);
  return createDigest(snippet, encoding);
}

function getStaticPropertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier' && node.value) {
    return node.value;
  }
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'NumericLiteral') {
    return String(node.value);
  }
  if (node.type === 'PrivateName' && node.id && node.id.name) {
    return `#${node.id.name}`;
  }
  return null;
}

function extractMemberChain(node, accumulator = []) {
  if (!node) return null;
  if (node.type === 'Identifier' && node.value) {
    const result = accumulator.slice();
    result.unshift(node.value);
    return result;
  }
  if (node.type === 'MemberExpression') {
    const propertyName = getStaticPropertyName(node.property);
    if (!propertyName) return null;
    const next = accumulator.slice();
    next.unshift(propertyName);
    return extractMemberChain(node.object, next);
  }
  if (node.type === 'MetaProperty' && node.meta && node.meta.value && node.property && node.property.value) {
    const result = accumulator.slice();
    result.unshift(node.property.value);
    result.unshift(node.meta.value);
    return result;
  }
  return null;
}

function resolveExportsAssignmentTarget(node) {
  const chain = extractMemberChain(node);
  if (!chain || chain.length === 0) {
    return null;
  }

  if (chain[0] === 'module' && chain[1] === 'exports') {
    const propertyChain = chain.slice(2);
    const base = 'module.exports';
    const scopeChain = propertyChain.length > 0 ? [base].concat(propertyChain) : [base];
    const displayName = propertyChain.length > 0 ? `module.exports.${propertyChain.join('.')}` : base;
    const name = propertyChain.length > 0 ? propertyChain[propertyChain.length - 1] : base;
    return {
      base,
      propertyChain,
      scopeChain,
      displayName,
      name
    };
  }

  if (chain[0] === 'exports') {
    const propertyChain = chain.slice(1);
    const scopeChain = ['exports'].concat(propertyChain);
    const displayName = propertyChain.length > 0 ? `exports.${propertyChain.join('.')}` : 'exports';
    const name = propertyChain.length > 0 ? propertyChain[propertyChain.length - 1] : 'exports';
    return {
      base: 'exports',
      propertyChain,
      scopeChain,
      displayName,
      name
    };
  }

  return null;
}

function normalizeContextStack(stack) {
  return Array.isArray(stack) ? stack : [];
}

function prependContext(stack, entry) {
  if (!entry) {
    return normalizeContextStack(stack);
  }
  return [entry, ...normalizeContextStack(stack)];
}

function formatEnclosingContexts(contexts) {
  return normalizeContextStack(contexts)
    .map((ctx) => {
      if (!ctx || typeof ctx !== 'object' || !ctx.span) return null;
      return {
        kind: ctx.kind || null,
        name: ctx.name || null,
        span: normalizeSpan(ctx.span)
      };
    })
    .filter(Boolean);
}

function recordFunction(results, source, meta) {
  const normalizedSpan = normalizeSpan(meta.span);
  const position = offsetToPosition(meta.lineIndex, normalizedSpan.start);

  const scopeChain = Array.isArray(meta.scopeChain) ? meta.scopeChain.slice() : [];
  const canonicalName = buildCanonicalName(meta.name, scopeChain, meta.exportKind);
  const pathSignature = buildPathSignature(meta.pathSegments, meta.nodeType);
  const hash = computeHash(source, normalizedSpan);
  const identifierSpan = meta.identifierSpan ? normalizeSpan(meta.identifierSpan) : null;
  const byteLength = Math.max(0, normalizedSpan.end - normalizedSpan.start);
  const enclosingContexts = formatEnclosingContexts(meta.enclosingContexts);
  const primaryEnclosing = enclosingContexts[0] || null;

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
    identifierSpan,
    byteLength,
    enclosingSpan: primaryEnclosing ? primaryEnclosing.span : null,
    enclosingKind: primaryEnclosing ? primaryEnclosing.kind : null,
    enclosingName: primaryEnclosing ? primaryEnclosing.name : null,
    enclosingContexts
  });
}

function recordVariable(results, source, meta) {
  const normalizedSpan = normalizeSpan(meta.span);
  const position = offsetToPosition(meta.lineIndex, normalizedSpan.start);
  const scopeChain = Array.isArray(meta.scopeChain) ? meta.scopeChain.slice() : [];
  const pathSignature = buildPathSignature(meta.pathSegments, meta.nodeType);
  const hash = computeHash(source, normalizedSpan);
  const byteLength = Math.max(0, normalizedSpan.end - normalizedSpan.start);
  const enclosingContexts = formatEnclosingContexts(meta.enclosingContexts);
  const primaryEnclosing = enclosingContexts[0] || null;

  results.push({
    name: meta.name,
    kind: meta.bindingKind || 'var',
    exportKind: meta.exportKind || null,
    scopeChain,
    span: normalizedSpan,
    line: position.line,
    column: position.column,
    pathSignature,
    pathSegments: Array.isArray(meta.pathSegments) ? meta.pathSegments.slice() : [],
    initializerType: meta.initializerType || null,
    hash,
    byteLength,
    enclosingSpan: primaryEnclosing ? primaryEnclosing.span : null,
    enclosingKind: primaryEnclosing ? primaryEnclosing.kind : null,
    enclosingName: primaryEnclosing ? primaryEnclosing.name : null,
    enclosingContexts
  });
}

function extendScopeChain(scopeChain, additions = []) {
  const base = Array.isArray(scopeChain) ? scopeChain : [];
  return base.concat(additions);
}

function extractBindingNames(pattern, results = []) {
  if (!pattern || typeof pattern !== 'object') {
    return results;
  }

  switch (pattern.type) {
    case 'Identifier':
      if (pattern.value) {
        results.push({ name: pattern.value, span: pattern.span });
      }
      break;
    case 'ArrayPattern': {
      const elements = Array.isArray(pattern.elements) ? pattern.elements : [];
      elements.forEach((element) => {
        if (!element) return;
        if (element.type === 'Identifier') {
          if (element.value) {
            results.push({ name: element.value, span: element.span });
          }
        } else if (element.type === 'AssignmentPattern' && element.left) {
          extractBindingNames(element.left, results);
        } else if (element.type === 'RestElement' && element.argument) {
          extractBindingNames(element.argument, results);
        } else if (element.type === 'ArrayPattern' || element.type === 'ObjectPattern') {
          extractBindingNames(element, results);
        }
      });
      break;
    }
    case 'ObjectPattern': {
      const properties = Array.isArray(pattern.properties) ? pattern.properties : [];
      properties.forEach((prop) => {
        if (!prop) return;
        if (prop.type === 'KeyValuePattern' || prop.type === 'KeyValuePatternProperty') {
          extractBindingNames(prop.value, results);
        } else if (prop.type === 'AssignPattern' || prop.type === 'AssignmentPatternProperty') {
          const key = prop.key;
          if (key && key.type === 'Identifier' && key.value) {
            results.push({ name: key.value, span: key.span });
          } else if (key) {
            extractBindingNames(key, results);
          }
        } else if (prop.type === 'RestElement' && prop.argument) {
          extractBindingNames(prop.argument, results);
        }
      });
      break;
    }
    case 'AssignmentPattern':
      if (pattern.left) {
        extractBindingNames(pattern.left, results);
      }
      break;
    case 'RestElement':
      if (pattern.argument) {
        extractBindingNames(pattern.argument, results);
      }
      break;
    default:
      if (pattern.argument) {
        extractBindingNames(pattern.argument, results);
      }
      break;
  }

  return results;
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

  function visit(node, context = { scopeChain: [], exportKind: null, enclosingContexts: [] }, pathSegments = ['module']) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const { type } = node;
    if (!type) return;

    const includeType = !(type === 'Module' && pathSegments.length === 1 && pathSegments[0] === 'module');
    const currentPath = includeType ? pathSegments.concat(type) : pathSegments;
    const currentScope = Array.isArray(context.scopeChain) ? context.scopeChain : [];
    const baseEnclosing = normalizeContextStack(context.enclosingContexts);

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
          identifierSpan: node.identifier ? node.identifier.span : null,
          enclosingContexts: baseEnclosing
        });
        if (node.body) {
          const childScope = extendScopeChain(scopeChain, shouldAppendName ? [] : [name]);
          const functionEntry = { kind: 'function-declaration', name, span: node.span };
          visit(
            node.body,
            { ...context, scopeChain: childScope, enclosingContexts: prependContext(baseEnclosing, functionEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ExportDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports']);
          const exportEntry = { kind: 'export', name: 'named', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'named',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
          const exportEntry = { kind: 'export', name: 'default', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultExpression': {
        const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
        const exportEntry = { kind: 'export', name: 'default', span: node.span };
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
            identifierSpan: node.expression.identifier ? node.expression.identifier.span : null,
            enclosingContexts: prependContext(baseEnclosing, exportEntry)
          });
        }
        if (node.expression) {
          visit(
            node.expression,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('expression')
          );
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
            nodeType: init.type,
            enclosingContexts: baseEnclosing
          });
        }
        if (init) {
          const name = id && id.type === 'Identifier' ? id.value : '(anonymous)';
          const funcEntry = {
            kind: init ? (init.type === 'ArrowFunctionExpression' ? 'arrow-function' : 'function-expression') : 'function',
            name,
            span: init.span || node.span
          };
          visit(init, { ...context, enclosingContexts: prependContext(baseEnclosing, funcEntry) }, currentPath.concat('init'));
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
            identifierSpan: node.identifier ? node.identifier.span : null,
            enclosingContexts: baseEnclosing
          });
        }
        if (node.body) {
          const funcScope = node.identifier ? extendScopeChain(currentScope, [node.identifier.value]) : currentScope;
          const entry = {
            kind: node.identifier ? 'function-expression' : 'function-expression',
            name: node.identifier ? node.identifier.value : '(anonymous)',
            span: node.span
          };
          visit(
            node.body,
            { ...context, scopeChain: funcScope, enclosingContexts: prependContext(baseEnclosing, entry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ExpressionStatement': {
        if (node.expression) {
          visit(node.expression, context, currentPath.concat('expression'));
        }
        break;
      }
      case 'AssignmentExpression': {
        const target = resolveExportsAssignmentTarget(node.left);
        const right = node.right;
        const exportEntry = target
          ? {
              kind: target.base,
              name: target.displayName,
              span: node.span
            }
          : null;

        if (target && right) {
          const exportKind = target.base === 'module.exports'
            ? target.propertyChain.length > 0
              ? 'commonjs-named'
              : 'commonjs-default'
            : 'commonjs-named';
          const scopeChain = target.scopeChain;

          if (right.type === 'FunctionExpression' || right.type === 'ArrowFunctionExpression') {
            const funcName = right.type === 'FunctionExpression' && right.identifier
              ? right.identifier.value
              : target.name;
            recordFunction(functions, source, {
              name: funcName,
              kind: right.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
              exportKind,
              replaceable: false,
              span: right.span,
              lineIndex,
              scopeChain,
              pathSegments: currentPath.concat('right'),
              nodeType: right.type,
              identifierSpan: right.identifier ? right.identifier.span : null,
              enclosingContexts: baseEnclosing
            });
          } else if (right.type === 'ClassExpression') {
            const className = right.identifier ? right.identifier.value : target.name || '(anonymous class)';
            recordFunction(functions, source, {
              name: className,
              kind: 'class',
              exportKind,
              replaceable: false,
              span: right.span,
              lineIndex,
              scopeChain,
              pathSegments: currentPath.concat('right'),
              nodeType: right.type,
              enclosingContexts: baseEnclosing
            });
          }
        }

        if (node.left) {
          visit(node.left, context, currentPath.concat('left'));
        }
        if (right) {
          const nextContext = target
            ? {
                ...context,
                scopeChain: extendScopeChain(currentScope, target.scopeChain),
                enclosingContexts: exportEntry ? prependContext(baseEnclosing, exportEntry) : baseEnclosing
              }
            : context;
          visit(right, nextContext, currentPath.concat('right'));
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
            nodeType: type,
            enclosingContexts: baseEnclosing
          });
        }
        const className = node.identifier ? node.identifier.value : '(anonymous class)';
        const classScope = node.identifier ? extendScopeChain(currentScope, [className]) : currentScope;
        const classSpan = context.exportSpan || node.span;
        const classEntry = { kind: 'class', name: className, span: classSpan };
        const members = Array.isArray(node.body)
          ? node.body
          : Array.isArray(node.body?.body)
            ? node.body.body
            : [];
        members.forEach((member, index) => {
          visit(
            member,
            {
              ...context,
              className,
              classSpan,
              scopeChain: classScope,
              enclosingContexts: prependContext(baseEnclosing, classEntry)
            },
            currentPath.concat(`body[${index}]`)
          );
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
          nodeType: type,
          enclosingContexts: baseEnclosing
        });
        if (node.function && node.function.body) {
          const methodEntry = {
            kind: 'class-method',
            name: context.className ? `${context.className}.${cleanName}` : cleanName,
            span: node.span
          };
          visit(
            node.function.body,
            { ...context, scopeChain, enclosingContexts: prependContext(baseEnclosing, methodEntry) },
            currentPath.concat('function.body')
          );
        }
        break;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === 'span') continue;
          const value = node[key];
          if (Array.isArray(value)) {
            value.forEach((child, index) => {
              visit(child, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(`${key}[${index}]`));
            });
          } else if (value && typeof value === 'object') {
            visit(value, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(key));
          }
        }
      }
    }
  }

  visit(ast, { scopeChain: [], exportKind: null, enclosingContexts: [] }, ['module']);

  functions.sort((a, b) => a.span.start - b.span.start);
  return { functions, lineIndex };
}

function collectVariables(ast, source) {
  const lineIndex = buildLineIndex(source);
  const variables = [];

  function visit(
    node,
    context = { scopeChain: [], exportKind: null, bindingKind: null, className: null, enclosingContexts: [] },
    pathSegments = ['module']
  ) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const { type } = node;
    if (!type) return;

    const includeType = !(type === 'Module' && pathSegments.length === 1 && pathSegments[0] === 'module');
    const currentPath = includeType ? pathSegments.concat(type) : pathSegments;
    const currentScope = Array.isArray(context.scopeChain) ? context.scopeChain : [];
    const baseEnclosing = normalizeContextStack(context.enclosingContexts);

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
        if (node.body) {
          const childScope = extendScopeChain(scopeChain, shouldAppendName ? [] : [name]);
          const functionEntry = { kind: 'function-declaration', name, span: node.span };
          visit(
            node.body,
            { ...context, scopeChain: childScope, className: null, enclosingContexts: prependContext(baseEnclosing, functionEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const identifier = node.identifier ? node.identifier.value : null;
        const funcScope = identifier ? extendScopeChain(currentScope, [identifier]) : currentScope;
        if (node.body) {
          const functionEntry = {
            kind: type === 'ArrowFunctionExpression' ? 'arrow-function' : 'function-expression',
            name: identifier || '(anonymous)',
            span: node.span
          };
          visit(
            node.body,
            { ...context, scopeChain: funcScope, className: null, enclosingContexts: prependContext(baseEnclosing, functionEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ClassDeclaration': {
        const className = node.identifier ? node.identifier.value : '(anonymous class)';
        const classScope = node.identifier ? extendScopeChain(currentScope, [className]) : currentScope;
        const classSpan = context.exportSpan || node.span;
        const classEntry = { kind: 'class', name: className, span: classSpan };
        const members = Array.isArray(node.body)
          ? node.body
          : Array.isArray(node.body?.body)
            ? node.body.body
            : [];
        members.forEach((member, index) => {
          visit(
            member,
            {
              ...context,
              className,
              classSpan,
              scopeChain: classScope,
              enclosingContexts: prependContext(baseEnclosing, classEntry)
            },
            currentPath.concat(`body[${index}]`)
          );
        });
        break;
      }
      case 'ClassMethod':
      case 'ClassPrivateMethod': {
        const methodName = ensureIdentifierName(node.key).replace(/^#/, '');
        const segments = [];
        if (node.kind === 'getter') {
          segments.push('get', methodName);
        } else if (node.kind === 'setter') {
          segments.push('set', methodName);
        } else if (node.isStatic) {
          segments.push('static', methodName);
        } else {
          segments.push(`#${methodName}`);
        }
        const methodScope = extendScopeChain(currentScope, segments);
        if (node.function && node.function.body) {
          const methodEntry = {
            kind: 'class-method',
            name: context.className ? `${context.className}.${methodName}` : methodName,
            span: node.span
          };
          visit(
            node.function.body,
            { ...context, scopeChain: methodScope, enclosingContexts: prependContext(baseEnclosing, methodEntry) },
            currentPath.concat('function.body')
          );
        }
        break;
      }
      case 'ClassProperty':
      case 'ClassPrivateProperty': {
        const key = node.key;
        let name = null;
        if (key && key.type === 'Identifier') {
          name = key.value;
        } else if (key && key.type === 'PrivateName' && key.id) {
          name = `#${key.id.name}`;
        }
        if (name) {
          recordVariable(variables, source, {
            name,
            span: key.span || node.span,
            lineIndex,
            scopeChain: currentScope,
            exportKind: context.exportKind || null,
            bindingKind: 'class-field',
            pathSegments: currentPath,
            nodeType: type,
            initializerType: node.value ? node.value.type : null,
            enclosingContexts: baseEnclosing
          });
        }
        if (node.value) {
          visit(node.value, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat('value'));
        }
        break;
      }
      case 'ExportDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports']);
          const exportEntry = { kind: 'export', name: 'named', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'named',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
          const exportEntry = { kind: 'export', name: 'default', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultExpression': {
        const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
        if (node.expression) {
          const exportEntry = { kind: 'export', name: 'default', span: node.span };
          visit(
            node.expression,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('expression')
          );
        }
        break;
      }
      case 'VariableDeclaration': {
        const bindingKind = node.kind || 'var';
        const declContext = { ...context, bindingKind };
        if (Array.isArray(node.declarations)) {
          node.declarations.forEach((decl, index) => {
            visit(decl, declContext, currentPath.concat(`declarations[${index}]`));
          });
        }
        break;
      }
      case 'VariableDeclarator': {
        const bindingKind = context.bindingKind || 'var';
        const initializerType = node.init ? node.init.type : null;
        const names = extractBindingNames(node.id, []);
        if (names.length === 0 && node.id && node.id.type === 'Identifier') {
          names.push({ name: node.id.value, span: node.id.span });
        }
        names.forEach((binding, index) => {
          if (!binding || !binding.name) return;
          const span = binding.span || node.id?.span || node.span;
          recordVariable(variables, source, {
            name: binding.name,
            span,
            lineIndex,
            scopeChain: currentScope,
            exportKind: context.exportKind || null,
            bindingKind,
            pathSegments: currentPath.concat(`binding[${index}]`),
            nodeType: type,
            initializerType,
            enclosingContexts: baseEnclosing
          });
        });
        if (node.init) {
          visit(node.init, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat('init'));
        }
        break;
      }
      case 'AssignmentExpression': {
        const target = resolveExportsAssignmentTarget(node.left);
        const right = node.right;
        const exportEntry = target
          ? {
              kind: target.base,
              name: target.displayName,
              span: node.span
            }
          : null;

        if (target) {
          const exportKind = target.base === 'module.exports'
            ? target.propertyChain.length > 0
              ? 'commonjs-named'
              : 'commonjs-default'
            : 'commonjs-named';
          const scopePrefix = Array.isArray(target.scopeChain) ? target.scopeChain.slice() : [];
          const variableName = scopePrefix.length > 0 ? scopePrefix.pop() : target.name;
          const scopeChain = extendScopeChain(currentScope, scopePrefix);
          const recordSpan = node.left && node.left.span ? node.left.span : node.span;

          recordVariable(variables, source, {
            name: variableName,
            span: recordSpan,
            lineIndex,
            scopeChain,
            exportKind,
            bindingKind: 'assignment',
            pathSegments: currentPath,
            nodeType: type,
            initializerType: right ? right.type || null : null,
            enclosingContexts: exportEntry ? prependContext(baseEnclosing, exportEntry) : baseEnclosing
          });
        }

        if (node.left) {
          visit(node.left, context, currentPath.concat('left'));
        }
        if (right) {
          const nextContext = target
            ? {
                ...context,
                scopeChain: extendScopeChain(currentScope, target.scopeChain),
                enclosingContexts: exportEntry ? prependContext(baseEnclosing, exportEntry) : baseEnclosing
              }
            : context;
          visit(right, nextContext, currentPath.concat('right'));
        }
        break;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === 'span') continue;
          const value = node[key];
          if (Array.isArray(value)) {
            value.forEach((child, index) => {
              visit(child, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(`${key}[${index}]`));
            });
          } else if (value && typeof value === 'object') {
            visit(value, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(key));
          }
        }
      }
    }
  }

  visit(ast, { scopeChain: [], exportKind: null, bindingKind: null, className: null, enclosingContexts: [] }, ['module']);

  variables.sort((a, b) => a.span.start - b.span.start);
  return { variables, lineIndex };
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
  collectVariables,
  extractCode,
  replaceSpan,
  normalizeSpan,
  computeHash,
  createDigest,
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING
};
