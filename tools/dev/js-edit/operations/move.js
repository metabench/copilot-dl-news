'use strict';

/**
 * Move Operations for js-edit
 * 移动操作模块
 * 
 * Provides multi-file function move capability:
 * - Extract from source
 * - Insert into target
 * - Delete from source
 * - Add import/export statements
 */

const path = require('path');
const fs = require('fs');

let deps = null;

function init(newDeps) {
  deps = { ...newDeps };
}

function requireDeps() {
  if (!deps) {
    throw new Error('js-edit move operations not initialized. Call init() before use.');
  }
  return deps;
}

/**
 * Generate an import statement for CommonJS or ESM
 * 生成导入语句
 */
function generateImportStatement(functionName, targetPath, sourceFile, style = 'auto') {
  const relativePath = path.relative(path.dirname(sourceFile), targetPath)
    .replace(/\\/g, '/')
    .replace(/\.js$/, '');
  
  const importPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  
  if (style === 'esm') {
    return `import { ${functionName} } from '${importPath}';`;
  } else if (style === 'cjs') {
    return `const { ${functionName} } = require('${importPath}');`;
  }
  
  // Auto-detect based on file content would be done by caller
  return `const { ${functionName} } = require('${importPath}');`;
}

/**
 * Generate an export statement
 * 生成导出语句
 */
function generateExportStatement(functionName, style = 'cjs') {
  if (style === 'esm') {
    return `export { ${functionName} };`;
  }
  return `module.exports.${functionName} = ${functionName};`;
}

/**
 * Detect module style from source code
 * 检测模块风格
 */
function detectModuleStyle(source) {
  const hasESMImport = /^\s*import\s+/m.test(source);
  const hasESMExport = /^\s*export\s+/m.test(source);
  const hasCJSRequire = /require\s*\(/m.test(source);
  const hasCJSExports = /module\.exports|exports\./m.test(source);
  
  if (hasESMImport || hasESMExport) {
    return 'esm';
  }
  if (hasCJSRequire || hasCJSExports) {
    return 'cjs';
  }
  return 'cjs'; // Default
}

/**
 * Find the position after the last import/require statement
 * 找到最后一个导入语句后的位置
 */
function findAfterLastImport(source) {
  const lines = source.split('\n');
  let lastImportLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(import\s+|const\s+.*=\s*require\(|let\s+.*=\s*require\(|var\s+.*=\s*require\()/.test(line)) {
      lastImportLine = i;
    }
  }
  
  if (lastImportLine === -1) {
    return 0; // No imports found, insert at beginning
  }
  
  // Return character position after the import line
  let pos = 0;
  for (let i = 0; i <= lastImportLine; i++) {
    pos += lines[i].length + 1; // +1 for newline
  }
  return pos;
}

/**
 * Find position before first function declaration
 * 找到第一个函数声明前的位置
 */
function findBeforeFirstFunction(source) {
  const match = source.match(/^(function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/m);
  if (match) {
    return match.index;
  }
  return source.length; // No function found, append at end
}

/**
 * Move a function from one file to another
 * 将函数从一个文件移动到另一个文件
 * 
 * @param {Object} options - Move options
 * @param {string} options.fromPath - Source file path
 * @param {string} options.toPath - Target file path
 * @param {string} options.functionName - Name or selector of function to move
 * @param {boolean} options.addExport - Add export in target file
 * @param {boolean} options.addImport - Add import in source file
 * @param {boolean} options.fix - Actually write changes
 * @param {string} options.insertPosition - Where to insert: 'end', 'after-imports', 'before-first-function'
 */
async function moveFunction(options) {
  const {
    parseModule,
    collectFunctions,
    extractCode,
    replaceSpan,
    writeOutputFile,
    outputJson,
    fmt,
    computeNewlineStats,
    prepareNormalizedSnippet
  } = requireDeps();

  const {
    fromPath,
    toPath,
    functionName,
    addExport = true,
    addImport = true,
    fix = false,
    insertPosition = 'end',
    json = false,
    quiet = false
  } = options;

  // Validate paths
  if (!fromPath || !toPath) {
    throw new Error('Both --from and --to paths are required for move operation');
  }
  if (fromPath === toPath) {
    throw new Error('Source and target files cannot be the same');
  }

  // Read source file
  let sourceContent;
  try {
    sourceContent = fs.readFileSync(fromPath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read source file ${fromPath}: ${error.message}`);
  }

  // Parse source and find function
  let sourceAst;
  try {
    sourceAst = parseModule(sourceContent, fromPath);
  } catch (error) {
    throw new Error(`Cannot parse source file ${fromPath}: ${error.message}`);
  }

  const { functions: sourceFunctions, mapper: sourceMapper } = collectFunctions(sourceAst, sourceContent);
  
  // Find the function to move
  const functionRecord = sourceFunctions.find(fn => 
    fn.name === functionName || 
    fn.canonicalName === functionName ||
    fn.pathSignature?.includes(functionName)
  );

  if (!functionRecord) {
    const available = sourceFunctions.slice(0, 10).map(f => f.name).join(', ');
    throw new Error(`Function "${functionName}" not found in ${fromPath}. Available: ${available}...`);
  }

  // Extract function code
  const functionCode = extractCode(sourceContent, functionRecord.span, sourceMapper);
  const sourceStyle = detectModuleStyle(sourceContent);

  // Read or create target file
  let targetContent = '';
  let targetExists = false;
  try {
    targetContent = fs.readFileSync(toPath, 'utf8');
    targetExists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Cannot read target file ${toPath}: ${error.message}`);
    }
    // File doesn't exist, will be created
    targetContent = "'use strict';\n\n";
  }

  const targetStyle = targetExists ? detectModuleStyle(targetContent) : sourceStyle;

  // Determine insertion position in target
  let insertPos;
  switch (insertPosition) {
    case 'after-imports':
      insertPos = findAfterLastImport(targetContent);
      break;
    case 'before-first-function':
      insertPos = findBeforeFirstFunction(targetContent);
      break;
    case 'end':
    default:
      insertPos = targetContent.length;
      break;
  }

  // Prepare function for insertion
  const targetNewlineStats = computeNewlineStats(targetContent);
  const normalizedFunction = prepareNormalizedSnippet(
    functionCode,
    targetNewlineStats.style,
    { ensureTrailingNewline: true }
  );

  // Build new target content
  let newTargetContent = 
    targetContent.slice(0, insertPos) + 
    '\n' + normalizedFunction.text + '\n' +
    targetContent.slice(insertPos);

  // Add export if requested
  if (addExport) {
    const exportStmt = generateExportStatement(functionRecord.name, targetStyle);
    // Add export at end of file
    newTargetContent = newTargetContent.trimEnd() + '\n\n' + exportStmt + '\n';
  }

  // Build new source content (remove function, add import)
  let newSourceContent = replaceSpan(sourceContent, functionRecord.span, '', sourceMapper);
  
  // Clean up empty lines left by deletion
  newSourceContent = newSourceContent.replace(/\n\n\n+/g, '\n\n');

  if (addImport) {
    const importStmt = generateImportStatement(functionRecord.name, toPath, fromPath, sourceStyle);
    const importPos = findAfterLastImport(newSourceContent);
    
    if (importPos === 0) {
      // No existing imports, add at the very beginning after 'use strict' if present
      const useStrictMatch = newSourceContent.match(/^['"]use strict['"];\s*\n?/);
      if (useStrictMatch) {
        const afterUseStrict = useStrictMatch[0].length;
        newSourceContent = 
          newSourceContent.slice(0, afterUseStrict) + 
          '\n' + importStmt + '\n' +
          newSourceContent.slice(afterUseStrict);
      } else {
        newSourceContent = importStmt + '\n\n' + newSourceContent;
      }
    } else {
      // Insert after last import
      newSourceContent = 
        newSourceContent.slice(0, importPos) + 
        importStmt + '\n' +
        newSourceContent.slice(importPos);
    }
  }

  // Validate both files parse correctly
  try {
    parseModule(newTargetContent, toPath);
  } catch (error) {
    throw new Error(`Move would produce invalid target file: ${error.message}`);
  }

  try {
    parseModule(newSourceContent, fromPath);
  } catch (error) {
    throw new Error(`Move would produce invalid source file: ${error.message}`);
  }

  // Prepare result
  const result = {
    operation: 'move-function',
    function: {
      name: functionRecord.name,
      canonicalName: functionRecord.canonicalName,
      kind: functionRecord.kind,
      hash: functionRecord.hash
    },
    source: {
      file: fromPath,
      removed: true,
      importAdded: addImport
    },
    target: {
      file: toPath,
      created: !targetExists,
      exportAdded: addExport,
      insertPosition
    },
    applied: fix
  };

  // Write files if --fix
  if (fix) {
    // Ensure target directory exists
    const targetDir = path.dirname(toPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    writeOutputFile(toPath, newTargetContent);
    writeOutputFile(fromPath, newSourceContent);
  }

  if (json) {
    outputJson(result);
    return result;
  }

  if (!quiet) {
    const { resolveLanguageContext } = require('../../i18n/helpers');
    const language = resolveLanguageContext(fmt);
    const isChinese = language.isChinese;

    const headerTitle = isChinese ? '函数移动' : 'Function Move';
    fmt.header(headerTitle);

    fmt.section(`${isChinese ? '函数' : 'Function'}: ${functionRecord.canonicalName || functionRecord.name}`);
    fmt.stat(isChinese ? '类型' : 'Kind', functionRecord.kind);
    fmt.stat(isChinese ? '源文件' : 'From', fromPath);
    fmt.stat(isChinese ? '目标文件' : 'To', toPath);
    fmt.stat(isChinese ? '插入位置' : 'Insert At', insertPosition);
    fmt.stat(isChinese ? '添加导出' : 'Add Export', addExport ? '✓' : '✗');
    fmt.stat(isChinese ? '添加导入' : 'Add Import', addImport ? '✓' : '✗');
    fmt.stat(isChinese ? '模式' : 'Mode', fix ? (isChinese ? '已应用' : 'applied') : (isChinese ? '预演' : 'dry-run'));

    if (!fix) {
      fmt.warn(isChinese 
        ? '预演模式: 未写入任何更改。使用 --fix 应用。'
        : 'Dry-run: no changes were written. Re-run with --fix to apply.');
    } else {
      fmt.success(isChinese 
        ? `已将 ${functionRecord.name} 从 ${path.basename(fromPath)} 移动到 ${path.basename(toPath)}`
        : `Moved ${functionRecord.name} from ${path.basename(fromPath)} to ${path.basename(toPath)}`);
    }
    fmt.footer();
  }

  return result;
}

module.exports = {
  init,
  moveFunction,
  generateImportStatement,
  generateExportStatement,
  detectModuleStyle,
  findAfterLastImport,
  findBeforeFirstFunction
};
