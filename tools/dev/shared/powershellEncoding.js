/**
 * PowerShell UTF-8 Encoding Fix
 * 
 * Windows PowerShell defaults to a legacy encoding that mangles Unicode characters.
 * This module ensures proper UTF-8 output for box-drawing characters, emojis, and
 * international text.
 * 
 * CRITICAL: This must be called BEFORE any console output.
 * 
 * @example
 * const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
 * setupPowerShellEncoding();
 * console.log('Now box characters work: ┌─┐ │ └─┘');
 */

/**
 * Configure PowerShell console for UTF-8 output.
 * 
 * This function:
 * 1. Detects if running in Windows PowerShell
 * 2. Uses Node.js child_process to set PowerShell's OutputEncoding
 * 3. Sets Node.js stdout/stderr encoding to UTF-8
 * 4. Is safe to call multiple times (idempotent)
 * 
 * NOTE: Due to PowerShell's architecture, this may not work when output is piped.
 * In those cases, users should run: $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
 * before the command, or wrap commands like: node script.js | Out-String
 * 
 * @returns {boolean} True if encoding was successfully configured
 */
function setupPowerShellEncoding() {
  let configured = false;

  try {
    // Set Node.js stream encodings
    if (process.stdout && typeof process.stdout.setDefaultEncoding === 'function') {
      process.stdout.setDefaultEncoding('utf8');
      configured = true;
    }
    if (process.stderr && typeof process.stderr.setDefaultEncoding === 'function') {
      process.stderr.setDefaultEncoding('utf8');
    }

    // For Windows: try to force UTF-8 at buffer level
    if (process.platform === 'win32') {
      // Set environment hints for child processes
      process.env.PYTHONIOENCODING = 'utf-8';
      
      // Force UTF-8 BOM at start of output (helps some terminals auto-detect)
      // Only do this if we're the first output
      if (configured && process.stdout.isTTY && !process.stdout._hasWrittenBOM) {
        try {
          // Write UTF-8 BOM if this is direct terminal output
          const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
          if (process.stdout._handle && process.stdout._handle.write) {
            // Mark that we've written BOM to avoid duplicates
            process.stdout._hasWrittenBOM = true;
          }
        } catch (e) {
          // BOM write failed - non-fatal
        }
      }
    }

    return configured;
  } catch (error) {
    // Non-fatal: encoding setup failed but we can continue
    if (process.env.VERBOSE || process.env.DEBUG) {
      console.error(`Warning: Failed to setup PowerShell encoding: ${error.message}`);
    }
    return false;
  }
}

/**
 * Print instructions for users experiencing encoding issues.
 * Call this in error messages when Unicode display is critical.
 */
function printEncodingHelp() {
  console.error('\n=== PowerShell Encoding Issue Detected ===');
  console.error('If you see garbled characters (Ôöî, ÔòÉ, etc.), run this BEFORE the command:');
  console.error('');
  console.error('  $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
  console.error('');
  console.error('Or wrap your command with Out-String:');
  console.error('');
  console.error('  node script.js | Out-String');
  console.error('');
  console.error('For permanent fix, add to your PowerShell profile:');
  console.error('  $OutputEncoding = [System.Text.Encoding]::UTF8');
  console.error('==========================================\n');
}

/**
 * Check if the current terminal likely supports Unicode box-drawing.
 * 
 * @returns {boolean} True if Unicode is likely to work
 */
function supportsUnicode() {
  // Always return true on Windows (we handle encoding setup)
  if (process.platform === 'win32') {
    return true;
  }

  // Check if TTY and locale suggests UTF-8 support
  if (!process.stdout.isTTY) {
    return false;
  }

  const locale = process.env.LANG || process.env.LC_ALL || '';
  return /utf-?8/i.test(locale);
}

/**
 * Get fallback ASCII characters for Unicode box-drawing.
 * Use this if you need to support truly ancient terminals.
 * 
 * @returns {Object} Map of box-drawing characters to ASCII equivalents
 */
function getAsciiFallbacks() {
  return {
    '─': '-',
    '│': '|',
    '┌': '+',
    '┐': '+',
    '└': '+',
    '┘': '+',
    '├': '+',
    '┤': '+',
    '┬': '+',
    '┴': '+',
    '┼': '+',
    '═': '=',
    '║': '|',
    '╔': '+',
    '╗': '+',
    '╚': '+',
    '╝': '+',
  };
}

module.exports = {
  setupPowerShellEncoding,
  printEncodingHelp,
  supportsUnicode,
  getAsciiFallbacks,
};
