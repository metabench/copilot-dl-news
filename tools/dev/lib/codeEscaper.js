'use strict';

const { parseModule } = require('./swcAst');

/**
 * Unescape a command-line code string.
 *
 * Supports:
 *   \" → " (escaped double quote)
 *   \\ → \ (escaped backslash)
 *   Other backslashes remain literal (e.g., \n stays as two characters \n)
 *
 * This allows users to pass code strings via --with-code with proper escaping:
 *   --with-code "const x = \"hello\";"  →  const x = "hello";
 *   --with-code "const path = \"C:\\\\file.js\";"  →  const path = "C:\file.js";
 *
 * @param {string} input - Raw command-line string (may contain escape sequences)
 * @returns {string} Unescaped code string
 */
function unescapeCodeString(input) {
  if (typeof input !== 'string') {
    return input;
  }

  let result = '';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    // Check for escape sequences
    if (char === '\\' && i + 1 < input.length) {
      const next = input[i + 1];

      // Handle \" → "
      if (next === '"') {
        result += '"';
        i += 1; // skip the next character
      } else if (next === '\\') {
        // Handle \\ → \
        result += '\\';
        i += 1; // skip the next character
      } else {
        // Other backslash sequences remain literal
        // e.g., \n stays as \n (two characters)
        result += char;
      }
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Validate JavaScript code syntax using SWC parser.
 *
 * Tries multiple validation strategies:
 * 1. As a full module (for complete code blocks like function declarations)
 * 2. As an expression statement (for destructuring, assignments, etc.)
 * 3. As an expression alone (for simpler code fragments)
 *
 * @param {string} code - JavaScript code to validate
 * @param {string} filePath - File path for error context (e.g., "<inline>")
 * @returns {object} { valid: boolean, error?: string, validatedAs?: string }
 */
function validateCodeSyntax(code, filePath = '<inline>') {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return {
      valid: false,
      error: 'Code is empty or not a string.',
      validatedAs: 'empty'
    };
  }

  // Strategy 1: Try as full module (handles function declarations, exports, etc.)
  try {
    parseModule(code, filePath);
    return { valid: true, validatedAs: 'module' };
  } catch (moduleError) {
    // Fall through to next strategy
  }

  // Strategy 2: Try as expression statement (wraps in module context)
  // This handles destructuring, assignments, and other statements
  try {
    const wrappedAsStatement = `${code};`;
    parseModule(wrappedAsStatement, filePath);
    return { valid: true, validatedAs: 'statement' };
  } catch (statementError) {
    // Fall through to next strategy
  }

  // Strategy 3: Try as expression (wraps in statement context)
  // This handles bare expressions like `{ x, y }` or function calls
  try {
    const wrappedAsExpression = `(${code});`;
    parseModule(wrappedAsExpression, filePath);
    return { valid: true, validatedAs: 'expression' };
  } catch (expressionError) {
    // All strategies failed
    return {
      valid: false,
      error: `Code is not valid JavaScript. Tried as: module, statement, and expression.`,
      validatedAs: 'none'
    };
  }
}

module.exports = {
  unescapeCodeString,
  validateCodeSyntax
};
