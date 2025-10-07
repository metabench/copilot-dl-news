const { extractDomain } = require('../../../../utils/domainUtils');

/**
 * QueuePlannerService - Plans which incomplete crawl queues should be resumed
 * 
 * Responsibilities:
 * - Normalize queue data from database
 * - Validate queue resume inputs (URL or args must exist)
 * - Plan which queues can resume based on:
 *   - Available capacity slots
 *   - Running job conflicts (no duplicate job IDs)
 *   - Domain conflicts (one queue per domain at a time)
 * - Collect running context (job IDs, domains)
 * - Build summary objects for API responses
 * 
 * Design Principles:
 * - Pure business logic (no HTTP concerns)
 * - Dependency injection for utilities
 * - Returns domain objects (not HTTP responses)
 * - Stateless operations
 * 
 * @example
 * const planner = new QueuePlannerService({
 *   extractDomain: domainUtils.extractDomain
 * });
 * 
 * const plan = planner.planResumeQueues({
 *   queues: incompleteQueues,
 *   availableSlots: 3,
 *   runningJobIds: new Set([1, 2]),
 *   runningDomains: new Set(['example.com'])
 * });
 * 
 * console.log(plan.selected); // Queues recommended for resumption
 * console.log(plan.processed); // All queues with state and reasons
 */
class QueuePlannerService {
  /**
   * Create a new QueuePlannerService
   * @param {Object} dependencies - Service dependencies
   * @param {Function} dependencies.extractDomain - Function to extract domain from URL
   * @throws {Error} If required dependencies are missing
   */
  constructor(dependencies = {}) {
    const { extractDomain: extractDomainFn } = dependencies;

    if (typeof extractDomainFn !== 'function') {
      throw new Error('QueuePlannerService requires extractDomain function');
    }

    this._extractDomain = extractDomainFn;
  }

  /**
   * Normalize raw queue row from database
   * 
   * Handles multiple timestamp formats:
   * - Numeric milliseconds (1696723200000)
   * - ISO 8601 strings ('2024-10-08T00:00:00.000Z')
   * - Null/undefined values
   * 
   * @param {Object} row - Raw queue row from database
   * @param {number} row.id - Queue ID
   * @param {string} [row.url] - Queue URL
   * @param {string} [row.args] - JSON-encoded args array
   * @param {string} [row.status] - Queue status
   * @param {number|string} [row.started_at] - Start timestamp (ms or ISO)
   * @param {number|string} [row.startedAt] - Alt property name
   * @returns {Object|null} Normalized queue object or null if invalid
   * @returns {number} .id - Queue ID
   * @returns {string|null} .url - Queue URL
   * @returns {string|null} .args - JSON-encoded args
   * @returns {string|null} .status - Queue status
   * @returns {number|null} .startedAt - Timestamp in milliseconds
   * @returns {string|null} .startedAtIso - Timestamp in ISO 8601 format
   */
  normalizeQueueRow(row) {
    if (!row) return null;

    // Handle multiple property name variations
    const startedRaw = row.started_at ?? row.startedAt ?? null;
    let startedAt = null;
    let startedAtIso = null;

    if (startedRaw != null) {
      const numeric = Number(startedRaw);
      if (Number.isFinite(numeric) && numeric > 0) {
        // Numeric milliseconds
        startedAt = numeric;
        try {
          startedAtIso = new Date(numeric).toISOString();
        } catch (_) {
          startedAtIso = null;
        }
      } else if (typeof startedRaw === 'string' && startedRaw.trim()) {
        // ISO 8601 string - but only if it looks like a valid date
        const trimmed = startedRaw.trim();
        // Simple validation: check if it parses to a valid date
        const testDate = new Date(trimmed);
        if (!isNaN(testDate.getTime())) {
          startedAtIso = trimmed;
        }
      }
    }

    return {
      id: row.id,
      url: row.url || null,
      args: row.args || null,
      status: row.status || null,
      startedAt,
      startedAtIso
    };
  }

  /**
   * Compute resume inputs for a queue
   * 
   * Determines if queue can be resumed based on:
   * - URL exists and is non-empty string
   * - args exists and is valid JSON array
   * 
   * @param {Object} queue - Normalized queue object
   * @param {string} [queue.url] - Queue URL
   * @param {string} [queue.args] - JSON-encoded args array
   * @returns {Object} Resume input analysis
   * @returns {Array<string>} .args - Parsed args array (empty if parse fails)
   * @returns {boolean} .hasArgs - True if args is non-empty array
   * @returns {boolean} .hasUrl - True if URL is non-empty string
   * @returns {string|null} .argsError - Error type: 'not-array' | 'parse-error' | null
   */
  computeResumeInputs(queue) {
    const info = {
      args: [],
      hasArgs: false,
      hasUrl: typeof queue?.url === 'string' && queue.url.trim().length > 0,
      argsError: null
    };

    if (queue && queue.args != null) {
      try {
        const parsed = JSON.parse(queue.args);
        if (Array.isArray(parsed)) {
          info.args = parsed.map((value) => (typeof value === 'string' ? value : String(value)));
        } else if (parsed != null) {
          info.argsError = 'not-array';
        }
      } catch (err) {
        info.argsError = 'parse-error';
      }
    }

    info.hasArgs = Array.isArray(info.args) && info.args.length > 0;
    return info;
  }

  /**
   * Plan which queues should be resumed
   * 
   * Selection Algorithm:
   * 1. Normalize all queue rows
   * 2. Compute resume inputs (URL or args)
   * 3. Extract domain from URL
   * 4. For each queue, determine state:
   *    - 'selected' - Recommended for resumption
   *    - 'blocked' - Cannot resume (already running, domain conflict, missing source)
   *    - 'queued' - Could resume but capacity exceeded
   * 5. Track domain guard to prevent multiple queues per domain
   * 
   * Priority Rules:
   * - Job already running → blocked
   * - No URL or args → blocked (missing-source)
   * - Domain conflict → blocked (domain-conflict)
   * - Capacity full → queued (capacity-exceeded)
   * - Otherwise → selected
   * 
   * @param {Object} options - Planning options
   * @param {Array<Object>} options.queues - Raw queue rows from database
   * @param {number} options.availableSlots - Number of slots available for new jobs
   * @param {Set<number>} options.runningJobIds - Set of currently running job IDs
   * @param {Set<string>} options.runningDomains - Set of currently running domains
   * @returns {Object} Planning result
   * @returns {Array<Object>} .selected - Queues recommended for resumption
   * @returns {Map<number, Object>} .info - Map of queue ID → planning info
   * @returns {Array<Object>} .processed - All queues with planning info
   */
  planResumeQueues(options = {}) {
    const {
      queues = [],
      availableSlots = 0,
      runningJobIds = new Set(),
      runningDomains = new Set()
    } = options;

    const infoById = new Map();
    const selected = [];
    const processed = [];
    const domainGuard = new Set(runningDomains);

    for (const row of queues) {
      const queue = this.normalizeQueueRow(row);
      if (!queue || queue.id == null) {
        continue;
      }

      const resumeInputs = this.computeResumeInputs(queue);
      const domain = queue.url ? this._extractDomain(queue.url) : null;

      const entry = {
        queue,
        domain,
        resumeInputs,
        state: 'available',
        reasons: []
      };

      // Determine state and reasons
      if (runningJobIds.has(queue.id)) {
        entry.state = 'blocked';
        entry.reasons.push('already-running');
      } else if (!resumeInputs.hasUrl && !resumeInputs.hasArgs) {
        entry.state = 'blocked';
        entry.reasons.push('missing-source');
      } else if (domain && domainGuard.has(domain)) {
        entry.state = 'blocked';
        entry.reasons.push('domain-conflict');
      } else if (selected.length >= availableSlots) {
        entry.state = 'queued';
        entry.reasons.push('capacity-exceeded');
      } else {
        entry.state = 'selected';
        selected.push(entry);
        if (domain) domainGuard.add(domain);
      }

      infoById.set(queue.id, entry);
      processed.push(entry);
    }

    return {
      selected,
      info: infoById,
      processed
    };
  }

  /**
   * Collect running context from job registry
   * 
   * Extracts:
   * - Set of running job IDs
   * - Set of running domains (extracted from job URLs)
   * 
   * @param {Object} jobRegistry - Job registry instance
   * @param {Function} jobRegistry.getJobs - Returns iterable of [id, job] entries
   * @returns {Object} Running context
   * @returns {Set<number>} .runningJobIds - Set of running job IDs
   * @returns {Set<string>} .runningDomains - Set of running domains
   */
  collectRunningContext(jobRegistry) {
    const runningJobIds = new Set();
    const runningDomains = new Set();

    if (jobRegistry && typeof jobRegistry.getJobs === 'function') {
      for (const [id, job] of jobRegistry.getJobs()) {
        runningJobIds.add(id);
        if (job && job.url) {
          const domain = this._extractDomain(job.url);
          if (domain) runningDomains.add(domain);
        }
      }
    }

    return { runningJobIds, runningDomains };
  }

  /**
   * Build queue summary for API response
   * 
   * Creates detailed summary with:
   * - Queue metadata (ID, URL, status, timestamps)
   * - Planning state (selected, blocked, queued)
   * - Blocking reasons (already-running, domain-conflict, etc.)
   * - Age calculation (milliseconds since start)
   * - Resume input validation status
   * 
   * @param {Object} plan - Plan result from planResumeQueues()
   * @param {Array<Object>} plan.processed - All processed queues
   * @param {Array<Object>} plan.selected - Selected queues
   * @param {Object} options - Summary options
   * @param {number} options.now - Current timestamp in milliseconds
   * @returns {Object} Queue summary
   * @returns {Array<Object>} .queues - Detailed queue info
   * @returns {Array<number>} .recommendedIds - IDs of selected queues
   * @returns {Array<string>} .blockedDomains - Domains with conflicts
   */
  buildQueueSummary(plan, options = {}) {
    const { now = Date.now() } = options;

    const queues = plan.processed.map((entry) => {
      const { queue, domain, resumeInputs, state, reasons } = entry;
      const startedAtMs = Number.isFinite(queue.startedAt) ? queue.startedAt : null;
      const ageMs = startedAtMs != null ? Math.max(0, now - startedAtMs) : null;

      return {
        id: queue.id,
        url: queue.url,
        status: queue.status,
        startedAt: queue.startedAtIso || queue.startedAt || null,
        startedAtMs,
        ageMs,
        domain,
        state,
        reasons,
        hasArgs: resumeInputs.hasArgs,
        hasUrl: resumeInputs.hasUrl,
        argsError: resumeInputs.argsError || null
      };
    });

    const recommendedIds = plan.selected.map((entry) => entry.queue.id);

    const blockedDomains = Array.from(
      new Set(
        plan.processed
          .filter((entry) => entry.reasons.includes('domain-conflict') && entry.domain)
          .map((entry) => entry.domain)
      )
    );

    return {
      queues,
      recommendedIds,
      blockedDomains
    };
  }
}

module.exports = { QueuePlannerService };
