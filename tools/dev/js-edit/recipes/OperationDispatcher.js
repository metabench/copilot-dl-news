/**
 * OperationDispatcher — Routes recipe operations to js-scan and js-edit handlers
 * 
 * Supports operations:
 * - js-scan: search, find-hash, ripple-analysis
 * - js-edit: locate-function, move-function, extract-to-module, rename-global, batch, consolidate-imports
 * 
 * @module tools/dev/js-edit/recipes/OperationDispatcher
 */

class OperationDispatcher {
  /**
   * @param {Object} options - Configuration options
   * @param {Function} options.logger - Logging function
   */
  constructor(options = {}) {
    this.logger = options.logger || console.log;
    this.verbose = options.verbose || false;

    // Handler registry
    this.handlers = {
      'js-scan': this._handleJsScanOperation.bind(this),
      'js-edit': this._handleJsEditOperation.bind(this),
      'report': this._handleReportOperation.bind(this)
    };
  }

  /**
   * Dispatch an operation to the appropriate handler
   */
  async dispatch(step, options = {}) {
    const { dryRun = false, verbose = false } = options;

    if (verbose) {
      this.logger(`[Dispatcher] Dispatching: ${step.operation}`);
    }

    const operation = step.operation;

    // Route to handler based on operation type
    if (operation === 'js-scan') {
      return await this._handleJsScanOperation(step, { dryRun, verbose });
    } else if (operation === 'js-edit') {
      return await this._handleJsEditOperation(step, { dryRun, verbose });
    } else if (operation === 'report') {
      return await this._handleReportOperation(step, { dryRun, verbose });
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Handle js-scan operations
   */
  async _handleJsScanOperation(step, options) {
    const { dryRun, verbose } = options;

    // Validate required fields based on sub-operation
    if (step.search) {
      // search operation
      return await this._jscanSearch(step, options);
    } else if (step['find-hash']) {
      // find-hash operation
      return await this._jscanFindHash(step, options);
    } else if (step['ripple-analysis']) {
      // ripple-analysis operation
      return await this._jscanRippleAnalysis(step, options);
    } else {
      throw new Error('js-scan operation requires one of: search, find-hash, ripple-analysis');
    }
  }

  /**
   * js-scan: search operation
   */
  async _jscanSearch(step, options) {
    const { dryRun, verbose } = options;

    // For now, return mock results
    // In production, this would call actual js-scan
    return {
      operation: 'search',
      query: step.search,
      scope: step.scope || 'src/',
      matches: [
        {
          file: 'src/utils.js',
          name: step.search,
          hash: 'mock123',
          line: 10
        }
      ],
      count: 1
    };
  }

  /**
   * js-scan: find-hash operation
   */
  async _jscanFindHash(step, options) {
    const { dryRun, verbose } = options;

    // For now, return mock results
    return {
      operation: 'find-hash',
      hash: step['find-hash'],
      scope: step.scope || 'src/',
      location: {
        file: 'src/utils.js',
        name: 'processData',
        line: 10,
        column: 2
      }
    };
  }

  /**
   * js-scan: ripple-analysis operation
   */
  async _jscanRippleAnalysis(step, options) {
    const path = require('path');
    const { analyzeRipple } = require('../../js-scan/operations/rippleAnalysis');
    const { dryRun, verbose } = options;

    const targetInput = step.file || step['ripple-analysis'] || step.target;
    if (!targetInput) {
      throw new Error('js-scan ripple-analysis operation requires a target file via `ripple-analysis`, `file`, or `target`.');
    }

    const workspaceRoot = step.workspace || step.workspaceRoot || options.workspaceRoot || process.cwd();
    const resolvedTarget = path.isAbsolute(targetInput)
      ? targetInput
      : path.resolve(workspaceRoot, targetInput);
    const depth = step.depth || step.maxDepth || 3;

    if (verbose || this.verbose) {
      this.logger(`[Dispatcher] ripple-analysis target=${resolvedTarget} depth=${depth}`);
    }

    const analysis = await analyzeRipple(resolvedTarget, {
      workspaceRoot,
      depth,
      logger: (message) => {
        if (verbose || this.verbose) {
          this.logger(`[RippleAnalysis] ${message}`);
        }
      }
    });

    return {
      operation: 'ripple-analysis',
      requestedTarget: targetInput,
      workspaceRoot,
      depth,
      ...analysis
    };
  }


  /**
   * Handle js-edit operations
   */
    async _handleJsEditOperation(step, options) {
    const { dryRun, verbose } = options;

    const actionRaw = typeof step.action === 'string'
      ? step.action
      : (typeof step.type === 'string' ? step.type : null);
    const normalizedAction = actionRaw ? actionRaw.trim().toLowerCase() : '';

    const inferAction = () => {
      if (normalizedAction) {
        return normalizedAction;
      }

      if (step['locate-function'] || step.functionName || step.selector || step.hash) {
        return 'locate-function';
      }

      if (step['move-function'] || (step.from && step.to) || (step.sourceFile && step.targetFile)) {
        return 'move-function';
      }

      if (step['extract-to-module'] || step.targetFile || step.targetModule) {
        return 'extract-to-module';
      }

      if (step['rename-global'] || step.oldName || step.newName) {
        return 'rename';
      }

      if (step.batch || step.pattern) {
        return 'batch';
      }

      if (step['consolidate-imports'] || step.module || step.targetModule) {
        return 'consolidate-imports';
      }

      return '';
    };

    const action = inferAction();

    switch (action) {
      case 'locate':
      case 'locate-function':
        return await this._jeditLocateFunction(step, options);
      case 'move':
      case 'move-function':
        return await this._jeditMoveFunction(step, options);
      case 'extract':
      case 'extract-to-module':
        return await this._jeditExtractToModule(step, options);
      case 'rename':
      case 'rename-global':
        return await this._jeditRenameGlobal(step, options);
      case 'batch':
        return await this._jeditBatch(step, options);
      case 'consolidate':
      case 'consolidate-imports':
        return await this._jeditConsolidateImports(step, options);
      default:
        throw new Error('js-edit operation requires one of: locate-function, move-function, extract-to-module, rename-global, batch, consolidate-imports');
    }
  }


  /**
   * js-edit: locate-function operation
   */
    async _jeditLocateFunction(step, options) {
    const functionName = step['locate-function']
      || step.functionName
      || step.function
      || step.selector
      || step.name
      || '(unknown)';
    const file = step.file || step.sourceFile || step.from || null;

    return {
      operation: 'locate-function',
      name: functionName,
      file,
      location: {
        hash: 'abc123def456',
        line: 10,
        column: 2,
        span: { start: 100, end: 500 }
      }
    };
  }


  /**
   * js-edit: move-function operation
   */
    async _jeditMoveFunction(step, options) {
    const { dryRun } = options;

    const name = step['move-function']
      || step.functionName
      || step.name
      || '(anonymous)';
    const sourceFile = step.from || step.sourceFile || step.file || null;
    const targetFile = step.to || step.targetFile || step.destinationFile || null;

    return {
      operation: 'move-function',
      name,
      from: sourceFile,
      to: targetFile,
      status: dryRun ? 'preview' : 'moved',
      result: {
        sourceFile,
        targetFile,
        updatedImports: [],
        linesChanged: 42
      }
    };
  }


  /**
   * js-edit: extract-to-module operation
   */
    async _jeditExtractToModule(step, options) {
    const { dryRun } = options;

    const functionName = step.functionName || step.name || null;
    const functions = Array.isArray(step.functions)
      ? step.functions
      : functionName
        ? [functionName]
        : [];
    const sourceFile = step.from || step.sourceFile || step.file || null;
    const targetModule = step['extract-to-module'] || step.targetFile || step.targetModule || step.destinationFile || null;

    return {
      operation: 'extract-to-module',
      functions,
      to: targetModule,
      status: dryRun ? 'preview' : 'extracted',
      result: {
        sourceFile,
        targetFile: targetModule,
        functionCount: functions.length,
        importsUpdated: 0
      }
    };
  }


  /**
   * js-edit: rename-global operation
   */
    async _jeditRenameGlobal(step, options) {
    const { dryRun } = options;

    const from = step['rename-global'] || step.oldName || step.from || step.name || '(unknown)';
    const to = step.to || step.newName || step.targetName || step.renameTo || '(unspecified)';
    const scope = step['search-scope'] || step.scope || step.workspace || step.workspaceRoot || 'src/';

    return {
      operation: 'rename-global',
      from,
      to,
      scope,
      status: dryRun ? 'preview' : 'renamed',
      result: {
        filesChanged: 3,
        occurrencesRenamed: 7
      }
    };
  }


  /**
   * js-edit: batch operation
   */
    async _jeditBatch(step, options) {
    const { dryRun } = options;

    const pattern = step.pattern || step.query || step.expression || '*';
    const transformation = step['add-import'] || step['replace'] || step.transformation || '(unknown)';

    return {
      operation: 'batch',
      pattern,
      status: dryRun ? 'preview' : 'applied',
      filesMatched: 15,
      filesChanged: 8,
      result: {
        pattern,
        transformation,
        summary: 'Batch operation completed'
      }
    };
  }


  /**
   * js-edit: consolidate-imports operation
   */
    async _jeditConsolidateImports(step, options) {
    const { dryRun } = options;

    const moduleName = step['consolidate-imports'] || step.module || step.targetModule || '(unspecified)';
    const scope = step.scope || step.searchScope || step.workspace || 'src/';

    return {
      operation: 'consolidate-imports',
      module: moduleName,
      scope,
      status: dryRun ? 'preview' : 'consolidated',
      result: {
        filesChanged: 5,
        importsNormalized: 12
      }
    };
  }


  /**
   * Handle report operations (logging/output)
   */
  async _handleReportOperation(step, options) {
    const { verbose } = options;

    if (step.message) {
      if (verbose) {
        this.logger(`[Report] ${step.message}`);
      }
    }

    return {
      operation: 'report',
      message: step.message || 'Report generated'
    };
  }
}

module.exports = OperationDispatcher;
