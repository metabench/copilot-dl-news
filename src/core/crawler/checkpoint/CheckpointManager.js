'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * CheckpointManager - Handles persistence of crawl checkpoints.
 *
 * Features:
 * - Atomic writes (write to temp, then rename)
 * - Rotation of checkpoint files
 * - Automatic cleanup of old checkpoints
 * - Validation on load
 *
 * @extends EventEmitter
 */
class CheckpointManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.checkpointDir - Directory to store checkpoints
   * @param {string} options.prefix - Filename prefix (default: 'checkpoint')
   * @param {number} options.maxCheckpoints - Max checkpoints to keep (default: 5)
   * @param {boolean} options.compress - Whether to gzip checkpoints (default: false)
   */
  constructor(options = {}) {
    super();

    this.checkpointDir = options.checkpointDir || path.join(process.cwd(), 'data', 'checkpoints');
    this.prefix = options.prefix || 'checkpoint';
    this.maxCheckpoints = options.maxCheckpoints || 5;
    this.compress = options.compress || false;

    this._ensureDir();
  }

  /**
   * Ensure checkpoint directory exists.
   * @private
   */
  _ensureDir() {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  /**
   * Generate checkpoint filename.
   * @private
   */
  _generateFilename(jobId, timestamp) {
    const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
    const base = jobId ? `${this.prefix}-${jobId}-${ts}` : `${this.prefix}-${ts}`;
    return base + '.json';
  }

  /**
   * Save checkpoint to disk.
   * @param {Object} checkpoint - Checkpoint data from CrawlOrchestrator.toCheckpoint()
   * @returns {string} Path to saved checkpoint
   */
  save(checkpoint) {
    if (!checkpoint) {
      throw new Error('Checkpoint data is required');
    }

    const filename = this._generateFilename(checkpoint.jobId);
    const filepath = path.join(this.checkpointDir, filename);
    const tempPath = filepath + '.tmp';

    // Serialize with pretty print for debuggability
    const data = JSON.stringify(checkpoint, null, 2);

    // Atomic write: temp file then rename
    try {
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, filepath);

      this.emit('saved', { path: filepath, size: data.length });

      // Cleanup old checkpoints
      this._cleanup();

      return filepath;
    } catch (error) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      this.emit('error', { operation: 'save', error });
      throw error;
    }
  }

  /**
   * Load the most recent checkpoint.
   * @param {string} jobId - Optional job ID to filter by
   * @returns {Object|null} Checkpoint data or null if none found
   */
  loadLatest(jobId = null) {
    const checkpoints = this.list(jobId);
    if (checkpoints.length === 0) {
      return null;
    }

    // Sorted by most recent first
    return this.load(checkpoints[0].path);
  }

  /**
   * Load checkpoint from path.
   * @param {string} filepath - Path to checkpoint file
   * @returns {Object} Checkpoint data
   */
  load(filepath) {
    if (!fs.existsSync(filepath)) {
      throw new Error(`Checkpoint not found: ${filepath}`);
    }

    try {
      const data = fs.readFileSync(filepath, 'utf8');
      const checkpoint = JSON.parse(data);

      // Validate checkpoint structure
      if (!this._validate(checkpoint)) {
        throw new Error('Invalid checkpoint format');
      }

      this.emit('loaded', { path: filepath, jobId: checkpoint.jobId });
      return checkpoint;
    } catch (error) {
      this.emit('error', { operation: 'load', path: filepath, error });
      throw error;
    }
  }

  /**
   * List available checkpoints.
   * @param {string} jobId - Optional job ID to filter by
   * @returns {Array} Sorted list of checkpoint info (most recent first)
   */
  list(jobId = null) {
    if (!fs.existsSync(this.checkpointDir)) {
      return [];
    }

    const files = fs.readdirSync(this.checkpointDir)
      .filter(f => f.startsWith(this.prefix) && f.endsWith('.json'))
      .filter(f => !jobId || f.includes(jobId));

    return files
      .map(filename => {
        const filepath = path.join(this.checkpointDir, filename);
        const stats = fs.statSync(filepath);
        return {
          filename,
          path: filepath,
          size: stats.size,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);
  }

  /**
   * Validate checkpoint structure.
   * @private
   */
  _validate(checkpoint) {
    if (!checkpoint || typeof checkpoint !== 'object') {
      return false;
    }

    // Must have version and timestamp
    if (!checkpoint.version || !checkpoint.timestamp) {
      return false;
    }

    // Must have context or minimal state
    if (!checkpoint.context && !checkpoint.plan) {
      return false;
    }

    return true;
  }

  /**
   * Clean up old checkpoints.
   * @private
   */
  _cleanup() {
    const checkpoints = this.list();

    if (checkpoints.length > this.maxCheckpoints) {
      const toDelete = checkpoints.slice(this.maxCheckpoints);

      for (const cp of toDelete) {
        try {
          fs.unlinkSync(cp.path);
          this.emit('deleted', { path: cp.path });
        } catch (error) {
          this.emit('error', { operation: 'cleanup', path: cp.path, error });
        }
      }
    }
  }

  /**
   * Delete all checkpoints for a job.
   * @param {string} jobId - Job ID to delete checkpoints for
   */
  deleteForJob(jobId) {
    const checkpoints = this.list(jobId);
    let deleted = 0;

    for (const cp of checkpoints) {
      try {
        fs.unlinkSync(cp.path);
        deleted++;
      } catch (error) {
        this.emit('error', { operation: 'delete', path: cp.path, error });
      }
    }

    return deleted;
  }

  /**
   * Delete all checkpoints.
   */
  deleteAll() {
    const checkpoints = this.list();
    let deleted = 0;

    for (const cp of checkpoints) {
      try {
        fs.unlinkSync(cp.path);
        deleted++;
      } catch (error) {
        this.emit('error', { operation: 'delete', path: cp.path, error });
      }
    }

    return deleted;
  }
}

/**
 * Create a checkpoint manager with orchestrator integration.
 * @param {CrawlOrchestrator} orchestrator
 * @param {Object} options
 * @returns {CheckpointManager}
 */
CheckpointManager.forOrchestrator = function(orchestrator, options = {}) {
  const manager = new CheckpointManager({
    checkpointDir: options.checkpointDir,
    prefix: options.prefix || orchestrator.context?.jobId || 'checkpoint',
    maxCheckpoints: options.maxCheckpoints,
    compress: options.compress
  });

  // Wire up checkpoint event from orchestrator
  orchestrator.on('checkpoint', (checkpoint) => {
    try {
      const path = manager.save(checkpoint);
      orchestrator.emit('checkpoint:saved', { path });
    } catch (error) {
      orchestrator.emit('checkpoint:error', { error });
    }
  });

  return manager;
};

module.exports = CheckpointManager;
