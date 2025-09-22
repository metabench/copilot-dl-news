// A light custom Jest reporter that truncates very large failure messages and diffs.
// Inspired by default reporter but only post-processes messages.

class TruncatingReporter {
  constructor(globalConfig, options = {}) {
    this._globalConfig = globalConfig;
    this._maxFailureLines = parseInt(process.env.JEST_MAX_FAILURE_LINES || options.maxFailureLines || '200', 10);
    this._maxLineLen = parseInt(process.env.JEST_MAX_FAILURE_COLS || options.maxFailureCols || '400', 10);
  }

  onRunComplete(_, results) {
    // Nothing
  }

  // Called for each test file result; we mutate failureMessages for display
  onTestResult(_, testResult) {
    try {
      if (!Array.isArray(testResult.testResults)) return;
      for (const tr of testResult.testResults) {
        if (!Array.isArray(tr.failureMessages)) continue;
        tr.failureMessages = tr.failureMessages.map((m) => this._truncate(m));
      }
    } catch {
      // ignore
    }
  }

  _truncate(message) {
    try {
      const lines = String(message).split(/\r?\n/);
      const max = this._maxFailureLines;
      const maxCols = this._maxLineLen;
      const kept = lines.slice(0, max).map(l => l.length > maxCols ? (l.slice(0, maxCols) + ' … [truncated]') : l);
      if (lines.length > max) {
        kept.push(`... [${lines.length - max} more lines truncated by jest-reporter-truncate]`);
      }
      return kept.join('\n');
    } catch {
      return message;
    }
  }
}

module.exports = TruncatingReporter;
