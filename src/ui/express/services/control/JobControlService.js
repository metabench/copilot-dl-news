/**
 * JobControlService - Service for controlling running jobs (pause, resume, stop)
 * 
 * This service extracts job control business logic from route handlers,
 * providing a clean interface for pause/resume/stop operations on running jobs.
 * 
 * @module services/control/JobControlService
 */

/**
 * Result object returned from control operations
 * @typedef {Object} ControlResult
 * @property {boolean} ok - Whether the operation succeeded
 * @property {string} [error] - Error code if operation failed
 * @property {string} [message] - Human-readable error message
 * @property {Object} [job] - The affected job object (if found)
 * @property {number} [escalatesInMs] - For stop operations, delay before SIGKILL
 * @property {boolean} [paused] - For pause/resume operations, new paused state
 */

/**
 * Service for controlling running crawler jobs
 * 
 * Handles pause, resume, and stop operations on jobs managed by JobRegistry.
 * Validates job existence, handles multiple job scenarios, and provides
 * consistent error responses for different failure modes.
 * 
 * @class JobControlService
 */
class JobControlService {
  /**
   * Creates a new JobControlService instance
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.jobRegistry - JobRegistry instance for job management
   * @throws {Error} If jobRegistry is not provided
   * 
   * @example
   * const service = new JobControlService({ jobRegistry });
   * const result = await service.stopJob({ jobId: 'abc123' });
   */
  constructor({ jobRegistry } = {}) {
    if (!jobRegistry) {
      throw new Error('JobControlService requires jobRegistry');
    }
    
    this.jobRegistry = jobRegistry;
  }

  /**
   * Validates job selection for control operations
   * 
   * Ensures that:
   * - At least one job is running
   * - If multiple jobs are running, jobId must be specified
   * - The specified jobId exists (if provided)
   * 
   * @param {string|null} jobId - Optional job ID to target
   * @returns {ControlResult} Result with ok=true or error details
   * 
   * @private
   */
  _validateJobSelection(jobId) {
    const jobCount = this.jobRegistry.jobCount();
    
    // No jobs running
    if (jobCount === 0) {
      return {
        ok: false,
        error: 'not-running',
        message: 'No jobs currently running'
      };
    }
    
    // Multiple jobs require explicit jobId
    if (!jobId && jobCount > 1) {
      return {
        ok: false,
        error: 'ambiguous',
        message: 'Multiple jobs running; specify jobId'
      };
    }
    
    // If jobId specified, verify it exists
    if (jobId) {
      const job = this.jobRegistry.getJob(jobId);
      if (!job) {
        return {
          ok: false,
          error: 'not-found',
          message: 'Job not found'
        };
      }
    }
    
    return { ok: true };
  }

  /**
   * Stops a running job (SIGTERM, escalates to SIGKILL)
   * 
   * Sends SIGTERM to the job's child process, with automatic escalation
   * to SIGKILL after a configurable delay if the process doesn't exit.
   * 
   * @param {Object} options - Stop options
   * @param {string|null} [options.jobId=null] - Job ID to stop (null = first job)
   * @param {number} [options.escalateDelayMs] - Delay before SIGKILL escalation
   * @returns {ControlResult} Result with stopped status and escalation delay
   * 
   * @example
   * // Stop specific job
   * const result = service.stopJob({ jobId: 'abc123' });
   * // result: { ok: true, stopped: true, escalatesInMs: 800, job: {...} }
   * 
   * @example
   * // Stop only job (when single job running)
   * const result = service.stopJob({ jobId: null });
   * 
   * @example
   * // Error cases
   * // No jobs: { ok: false, error: 'not-running', ... }
   * // Multiple jobs, no ID: { ok: false, error: 'ambiguous', ... }
   * // Job not found: { ok: false, error: 'not-found', ... }
   */
  stopJob({ jobId = null, escalateDelayMs } = {}) {
    // Validate job selection
    const validation = this._validateJobSelection(jobId);
    if (!validation.ok) {
      return validation;
    }
    
    // Delegate to JobRegistry for actual stop operation
    const options = escalateDelayMs !== undefined ? { escalateDelayMs } : undefined;
    const result = this.jobRegistry.stopJob(jobId, options);
    
    if (!result.ok) {
      return {
        ok: false,
        error: 'not-found',
        message: 'Job not found'
      };
    }
    
    return {
      ok: true,
      stopped: true,
      escalatesInMs: result.escalatesInMs,
      job: result.job
    };
  }

  /**
   * Pauses a running job (sends PAUSE command via stdin)
   * 
   * Sends a PAUSE command to the job's stdin, causing the crawler to
   * temporarily stop processing. Requires that the job has stdin available
   * and is not already killed.
   * 
   * @param {Object} options - Pause options
   * @param {string|null} [options.jobId=null] - Job ID to pause (null = first job)
   * @returns {ControlResult} Result with paused status or error details
   * 
   * @example
   * // Success
   * const result = service.pauseJob({ jobId: 'abc123' });
   * // result: { ok: true, paused: true, job: {...} }
   * 
   * @example
   * // Error: stdin unavailable
   * // result: { ok: false, error: 'stdin-unavailable', paused: false, job: {...} }
   */
  pauseJob({ jobId = null } = {}) {
    // Validate job selection
    const validation = this._validateJobSelection(jobId);
    if (!validation.ok) {
      return { ...validation, paused: false };
    }
    
    // Delegate to JobRegistry for actual pause operation
    const result = this.jobRegistry.pauseJob(jobId);
    
    if (!result.ok) {
      const error = result.error || 'stdin-unavailable';
      return {
        ok: false,
        error,
        paused: false,
        message: error === 'not-found' 
          ? 'Job not found'
          : error === 'stdin-unavailable'
          ? 'Job stdin unavailable (process may have exited)'
          : error,
        job: result.job
      };
    }
    
    return {
      ok: true,
      paused: true,
      job: result.job
    };
  }

  /**
   * Resumes a paused job (sends RESUME command via stdin)
   * 
   * Sends a RESUME command to the job's stdin, causing a paused crawler
   * to continue processing. Requires that the job has stdin available
   * and is not already killed.
   * 
   * @param {Object} options - Resume options
   * @param {string|null} [options.jobId=null] - Job ID to resume (null = first job)
   * @returns {ControlResult} Result with paused status (false = resumed) or error details
   * 
   * @example
   * // Success
   * const result = service.resumeJob({ jobId: 'abc123' });
   * // result: { ok: true, paused: false, job: {...} }
   * 
   * @example
   * // Error: stdin unavailable
   * // result: { ok: false, error: 'stdin-unavailable', paused: false, job: {...} }
   */
  resumeJob({ jobId = null } = {}) {
    // Validate job selection
    const validation = this._validateJobSelection(jobId);
    if (!validation.ok) {
      return { ...validation, paused: false };
    }
    
    // Delegate to JobRegistry for actual resume operation
    const result = this.jobRegistry.resumeJob(jobId);
    
    if (!result.ok) {
      const error = result.error || 'stdin-unavailable';
      return {
        ok: false,
        error,
        paused: false,
        message: error === 'not-found'
          ? 'Job not found'
          : error === 'stdin-unavailable'
          ? 'Job stdin unavailable (process may have exited)'
          : error,
        job: result.job
      };
    }
    
    return {
      ok: true,
      paused: false,
      job: result.job
    };
  }

  /**
   * Gets the count of currently running jobs
   * 
   * Convenience method for checking how many jobs are active.
   * 
   * @returns {number} Number of running jobs
   * 
   * @example
   * const count = service.getJobCount();
   * if (count === 0) console.log('No jobs running');
   */
  getJobCount() {
    return this.jobRegistry.jobCount();
  }

  /**
   * Gets a specific job by ID
   * 
   * @param {string} jobId - Job ID to retrieve
   * @returns {Object|null} Job object or null if not found
   * 
   * @example
   * const job = service.getJob('abc123');
   * if (job) console.log(`Job ${job.id} is ${job.paused ? 'paused' : 'running'}`);
   */
  getJob(jobId) {
    return this.jobRegistry.getJob(jobId);
  }

  /**
   * Gets the first job (useful when only one job is running)
   * 
   * @returns {Object|null} First job object or null if no jobs
   * 
   * @example
   * const job = service.getFirstJob();
   * if (job && job.paused) service.resumeJob({ jobId: job.id });
   */
  getFirstJob() {
    return this.jobRegistry.getFirstJob();
  }
}

module.exports = {
  JobControlService
};
