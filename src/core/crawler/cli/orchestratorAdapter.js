'use strict';

const {
  CLI_COLORS,
  CLI_ICONS,
  createCliLogger,
  isVerboseMode
} = require('./progressReporter');

/**
 * Icons for orchestrator events
 */
const ORCHESTRATOR_ICONS = Object.freeze({
  started: '🚀',
  stopped: '🛑',
  paused: '⏸️',
  resumed: '▶️',
  goal: '🎯',
  budget: '💰',
  checkpoint: '💾',
  phase: '📊',
  worker: '⚙️',
  error: '❌',
  complete: '✅'
});

/**
 * Create a CLI adapter for CrawlOrchestrator.
 * Subscribes to orchestrator events and produces user-friendly console output.
 * 
 * @param {CrawlOrchestrator} orchestrator - The orchestrator instance
 * @param {Object} options - Configuration options
 * @param {Function} options.stdout - Output function (default: console.log)
 * @param {Function} options.stderr - Error function (default: console.error)
 * @param {boolean} options.showPhases - Show phase change events (default: true)
 * @param {boolean} options.showGoals - Show goal satisfaction events (default: true)
 * @param {boolean} options.showBudget - Show budget exhaustion events (default: true)
 * @param {boolean} options.showCheckpoints - Show checkpoint events (default: verbose only)
 * @returns {Object} Adapter with detach() method
 */
function createOrchestratorCliAdapter(orchestrator, options = {}) {
  const {
    stdout = console.log,
    stderr = console.error,
    showPhases = true,
    showGoals = true,
    showBudget = true,
    showCheckpoints = false
  } = options;

  const log = createCliLogger({ stdout, stderr });
  const listeners = [];

  // Helper to register events
  const on = (event, handler) => {
    orchestrator.on(event, handler);
    listeners.push({ event, handler });
  };

  // ─────────────────────────────────────────
  // LIFECYCLE EVENTS
  // ─────────────────────────────────────────

  on('started', (data) => {
    stdout(CLI_COLORS.success(`${ORCHESTRATOR_ICONS.started} Crawl started`));
    if (data.jobId) {
      stdout(CLI_COLORS.muted(`  Job ID: ${data.jobId}`));
    }
    if (data.plan?.goals?.length) {
      stdout(CLI_COLORS.muted(`  Goals: ${data.plan.goals.length} defined`));
    }
    if (data.budget) {
      const limits = Object.entries(data.budget.limits || {})
        .filter(([, v]) => v !== Infinity)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (limits) {
        stdout(CLI_COLORS.muted(`  Budget: ${limits}`));
      }
    }
  });

  on('stopped', (data) => {
    const icon = data.reason === 'completed' ? ORCHESTRATOR_ICONS.complete : ORCHESTRATOR_ICONS.stopped;
    const color = data.reason === 'completed' ? CLI_COLORS.success : CLI_COLORS.warning;
    stdout(color(`${icon} Crawl stopped: ${data.reason}`));
  });

  on('paused', () => {
    stdout(CLI_COLORS.warning(`${ORCHESTRATOR_ICONS.paused} Crawl paused`));
  });

  on('resumed', () => {
    stdout(CLI_COLORS.info(`${ORCHESTRATOR_ICONS.resumed} Crawl resumed`));
  });

  // ─────────────────────────────────────────
  // PHASE EVENTS
  // ─────────────────────────────────────────

  if (showPhases) {
    on('phase:changed', (data) => {
      const phaseLabels = {
        'idle': 'Idle',
        'initializing': 'Initializing',
        'seeding': 'Seeding URLs',
        'crawling': 'Crawling',
        'draining': 'Draining queue',
        'analyzing': 'Analyzing results',
        'completed': 'Completed',
        'stalled': 'Stalled'
      };
      const label = phaseLabels[data.phase] || data.phase;
      const color = data.phase === 'completed' ? CLI_COLORS.success :
                    data.phase === 'stalled' ? CLI_COLORS.warning :
                    CLI_COLORS.progress;
      stdout(color(`${ORCHESTRATOR_ICONS.phase} Phase: ${label}`));
    });
  }

  // ─────────────────────────────────────────
  // GOAL EVENTS
  // ─────────────────────────────────────────

  if (showGoals) {
    on('goal:satisfied', (data) => {
      stdout(CLI_COLORS.success(`${ORCHESTRATOR_ICONS.goal} Goal satisfied: ${data.goalId || data.type}`));
    });

    on('goals:all-satisfied', () => {
      stdout(CLI_COLORS.success(`${ORCHESTRATOR_ICONS.complete} All goals satisfied!`));
    });
  }

  // ─────────────────────────────────────────
  // BUDGET EVENTS
  // ─────────────────────────────────────────

  if (showBudget) {
    on('budget:exhausted', (data) => {
      stdout(CLI_COLORS.warning(`${ORCHESTRATOR_ICONS.budget} Budget exhausted: ${data.resource}`));
    });
  }

  // ─────────────────────────────────────────
  // CHECKPOINT EVENTS
  // ─────────────────────────────────────────

  if (showCheckpoints || isVerboseMode()) {
    on('checkpoint:saved', (data) => {
      stdout(CLI_COLORS.muted(`${ORCHESTRATOR_ICONS.checkpoint} Checkpoint saved`));
      if (isVerboseMode() && data.path) {
        stdout(CLI_COLORS.dim(`  Path: ${data.path}`));
      }
    });

    on('checkpoint:restored', (data) => {
      stdout(CLI_COLORS.info(`${ORCHESTRATOR_ICONS.checkpoint} Checkpoint restored`));
      if (data.visitedCount != null) {
        stdout(CLI_COLORS.muted(`  Resumed with ${data.visitedCount} visited URLs`));
      }
    });
  }

  // ─────────────────────────────────────────
  // ERROR EVENTS
  // ─────────────────────────────────────────

  on('url:error', (data) => {
    if (isVerboseMode()) {
      stderr(CLI_COLORS.error(`${ORCHESTRATOR_ICONS.error} Error: ${data.url}`));
      if (data.error) {
        stderr(CLI_COLORS.dim(`  ${data.error}`));
      }
    }
  });

  on('stalled', (data) => {
    stderr(CLI_COLORS.warning(`${ORCHESTRATOR_ICONS.error} Crawl stalled`));
    if (data.reason) {
      stderr(CLI_COLORS.muted(`  Reason: ${data.reason}`));
    }
  });

  // ─────────────────────────────────────────
  // PROGRESS UPDATES (periodic)
  // ─────────────────────────────────────────

  let lastProgressTime = 0;
  const PROGRESS_INTERVAL_MS = 5000; // Show progress every 5 seconds

  on('url:visited', (data) => {
    const now = Date.now();
    if (now - lastProgressTime >= PROGRESS_INTERVAL_MS) {
      lastProgressTime = now;
      const stats = orchestrator.context?.stats;
      if (stats) {
        const visited = stats.visited || 0;
        const articles = stats.articles || 0;
        const errors = stats.errors || 0;
        stdout(CLI_COLORS.progress(`${CLI_ICONS.progress} Progress: ${visited} pages, ${articles} articles, ${errors} errors`));
      }
    }
  });

  // ─────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────

  const detach = () => {
    for (const { event, handler } of listeners) {
      orchestrator.off(event, handler);
    }
    listeners.length = 0;
  };

  return { detach };
}

/**
 * Print a summary of orchestrator stats.
 * 
 * @param {CrawlOrchestrator} orchestrator
 * @param {Object} options
 */
function printOrchestratorSummary(orchestrator, { stdout = console.log } = {}) {
  const stats = orchestrator.context?.stats || {};
  const budget = orchestrator.budget?.summary || {};
  const goals = orchestrator.plan?.goals || [];

  stdout('');
  stdout(CLI_COLORS.info(`${CLI_ICONS.summary} Crawl Summary`));
  stdout(CLI_COLORS.muted('─'.repeat(40)));
  
  // Stats
  stdout(`  ${CLI_ICONS.bullet} Pages visited: ${CLI_COLORS.neutral(stats.visited || 0)}`);
  stdout(`  ${CLI_ICONS.bullet} Articles found: ${CLI_COLORS.neutral(stats.articles || 0)}`);
  stdout(`  ${CLI_ICONS.bullet} Errors: ${CLI_COLORS.neutral(stats.errors || 0)}`);

  // Budget usage
  if (budget.limits) {
    stdout('');
    stdout(CLI_COLORS.muted('  Budget Usage:'));
    for (const [resource, limit] of Object.entries(budget.limits)) {
      if (limit !== Infinity) {
        const spent = budget.spent?.[resource] || 0;
        const pct = Math.round((spent / limit) * 100);
        stdout(`    ${resource}: ${spent}/${limit} (${pct}%)`);
      }
    }
  }

  // Goals
  if (goals.length > 0) {
    stdout('');
    stdout(CLI_COLORS.muted('  Goals:'));
    for (const goal of goals) {
      const icon = goal.status === 'satisfied' ? CLI_ICONS.success : CLI_ICONS.pending;
      const color = goal.status === 'satisfied' ? CLI_COLORS.success : CLI_COLORS.muted;
      stdout(color(`    ${icon} ${goal.type}: ${goal.status || 'pending'}`));
    }
  }

  stdout(CLI_COLORS.muted('─'.repeat(40)));
  stdout('');
}

module.exports = {
  createOrchestratorCliAdapter,
  printOrchestratorSummary,
  ORCHESTRATOR_ICONS
};
