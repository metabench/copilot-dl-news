const path = require('path');
const {
  CLI_COLORS,
  CLI_ICONS,
  CLI_STAGE_LABELS,
  CLI_STAGE_ICONS,
  CLI_STAGE_COLORS,
  formatStageStart,
  formatStageComplete,
  formatAllStagesSummary,
  isVerboseMode
} = require('./progressReporter');

const DEFAULT_TELEMETRY_STYLES = Object.freeze({
  info: { icon: CLI_ICONS.info, color: CLI_COLORS.info },
  success: { icon: CLI_ICONS.success, color: CLI_COLORS.success },
  warning: { icon: CLI_ICONS.warning, color: CLI_COLORS.warning },
  warn: { icon: CLI_ICONS.warning, color: CLI_COLORS.warning },
  error: { icon: CLI_ICONS.error, color: CLI_COLORS.error },
  critical: { icon: CLI_ICONS.error, color: CLI_COLORS.error },
  debug: { icon: CLI_ICONS.debug, color: CLI_COLORS.muted }
});

const DEFAULT_STARTUP_STAGE_LABELS = Object.freeze({
  'prepare-data': 'Preparing data directory',
  'db-open': 'Opening crawl database',
  'db-gazetteer-schema': 'Ensuring gazetteer schema',
  'enhanced-features': 'Starting enhanced features',
  'gazetteer-prepare': 'Preparing gazetteer services'
});

const DEFAULT_MILESTONE_ICONS = Object.freeze({
  'gazetteer-schema': { icon: CLI_ICONS.schema, color: CLI_COLORS.progress },
  'gazetteer-config': { icon: CLI_ICONS.compass, color: CLI_COLORS.accent },
  'gazetteer-init': { icon: CLI_ICONS.progress, color: CLI_COLORS.progress },
  'gazetteer-init-complete': { icon: CLI_ICONS.complete, color: CLI_COLORS.success },
  'gazetteer-mode': { icon: CLI_ICONS.geography, color: CLI_COLORS.success },
  'gazetteer-mode-summary': { icon: CLI_ICONS.compass, color: CLI_COLORS.accent },
  debug: { icon: CLI_ICONS.debug, color: CLI_COLORS.muted }
});

const DEFAULT_SUPPRESSED_PREFIXES = Object.freeze([
  '[WikidataCountryIngestor]',
  '[WikidataAdm1Ingestor]',
  '[WikidataCitiesIngestor]',
  '[createIngestionStatements]',
  '[CountryHubGapAnalyzer]',
  'Enhanced database adapter initialized',
  'Priority scorer initialized',
  'Problem clustering service initialized',
  'Planner knowledge service initialized',
  'Problem resolution service initialized',
  'Crawl playbook service initialized',
  'Country hub gap service initialized',
  '[GazetteerPriorityScheduler]'
]);

const formatPageEvent = (payload) => {
  if (!payload || !payload.url) return null;

  const isError = payload.status === 'failed' || payload.status === 'error';
  const isCache = payload.source === 'cache' || payload.status === 'cache' || payload.status === 'not-modified';
  const icon = isError ? CLI_ICONS.error : (isCache ? CLI_ICONS.info : CLI_ICONS.success);
  const color = isError ? CLI_COLORS.error : (isCache ? CLI_COLORS.accent : CLI_COLORS.success);

  const rounded = (value) => Math.max(0, Math.round(value));
  let timingLabel = null;
  if (Number.isFinite(payload.downloadMs)) {
    timingLabel = `${rounded(payload.downloadMs)}ms`;
  } else if (Number.isFinite(payload.totalMs)) {
    timingLabel = `${rounded(payload.totalMs)}ms`;
  } else if (Number.isFinite(payload.cacheAgeSeconds)) {
    timingLabel = `cache~${rounded(payload.cacheAgeSeconds)}s`;
  } else if (isCache) {
    timingLabel = 'cache';
  }

  const parts = [];
  if (timingLabel) parts.push(timingLabel);
  const sourceLabel = payload.source || (isCache ? 'cache' : 'network');
  parts.push(sourceLabel);

  if (payload.httpStatus && payload.httpStatus !== 200) {
    parts.push(`HTTP ${payload.httpStatus}`);
  }

  parts.push(payload.url);

  if (payload.error) {
    parts.push(`(${payload.error})`);
  }

  return color(`${icon} ${parts.join(' ')}`);
};

function createCliConsoleInterceptor({
  log,
  consoleRef = console,
  telemetryStyles = DEFAULT_TELEMETRY_STYLES,
  milestoneIcons = DEFAULT_MILESTONE_ICONS,
  startupStageLabels = DEFAULT_STARTUP_STAGE_LABELS,
  suppressedPrefixes = DEFAULT_SUPPRESSED_PREFIXES
} = {}) {
  if (!log || typeof log.formatGeographyProgress !== 'function') {
    throw new TypeError('createCliConsoleInterceptor requires a CLI logger with formatGeographyProgress');
  }

  const originalConsoleLog = consoleRef.log;
  const originalConsoleWarn = consoleRef.warn;
  const originalConsoleError = consoleRef.error;
  const originalConsoleInfo = consoleRef.info;
  const originalConsoleDebug = consoleRef.debug;

  const handleTelemetryPayload = (payload) => {
    const severity = (payload.severity || 'info').toLowerCase();
    const style = telemetryStyles[severity] || telemetryStyles.info;
    const message = payload.message || payload.event || 'Telemetry';

    if (payload.event === 'startup-stage') {
      const stageKey = payload.details?.stage || payload.event;
      const stageLabel = startupStageLabels[stageKey] || message;
      const status = payload.status || 'info';
      const statusIcon = status === 'completed'
        ? CLI_ICONS.complete
        : status === 'started'
          ? CLI_ICONS.pending
          : style.icon;
      const statusColor = status === 'completed'
        ? CLI_COLORS.success
        : status === 'started'
          ? CLI_COLORS.progress
          : style.color;
      originalConsoleLog(statusColor(`${statusIcon} ${stageLabel}`));
      return;
    }

    const shouldShow = severity !== 'info' || isVerboseMode();
    if (!shouldShow) {
      return;
    }

    originalConsoleLog(style.color(`${style.icon} ${message}`));
  };

  const handleMilestonePayload = (payload) => {
    const kind = payload.kind || 'debug';
    const descriptor = milestoneIcons[kind] || milestoneIcons.debug;
    const message = payload.message || kind;
    originalConsoleLog(descriptor.color(`${descriptor.icon} ${message}`));
  };

  const shouldSuppress = (text) => suppressedPrefixes.some(prefix => text.startsWith(prefix));

  consoleRef.log = function cliConsoleLog(...logArgs) {
    const firstArg = logArgs[0];

    if (typeof firstArg === 'string' && firstArg.startsWith('PAGE ')) {
      try {
        const payload = JSON.parse(firstArg.substring('PAGE '.length));
        const formatted = formatPageEvent(payload);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
        return;
      } catch (_) {
        // fall through
      }
    }

    if (!isVerboseMode() && typeof firstArg === 'string' && firstArg.startsWith('CACHE ')) {
      return;
    }

    if (typeof firstArg === 'string' && firstArg.startsWith('PROGRESS ')) {
      try {
        const jsonStr = firstArg.substring('PROGRESS '.length);
        const data = JSON.parse(jsonStr);
        if (data.gazetteer) {
          const formatted = log.formatGeographyProgress(data);
          if (formatted) {
            originalConsoleLog(formatted);
            return;
          }
        }
        return;
      } catch (_) {
        // fall through to default logging
      }
    }

    if (typeof firstArg === 'string' && firstArg.startsWith('TELEMETRY ')) {
      try {
        const payload = JSON.parse(firstArg.substring('TELEMETRY '.length));
        handleTelemetryPayload(payload);
        return;
      } catch (_) {
        // fall through
      }
    }

    if (typeof firstArg === 'string' && firstArg.startsWith('MILESTONE ')) {
      try {
        const payload = JSON.parse(firstArg.substring('MILESTONE '.length));
        handleMilestonePayload(payload);
        return;
      } catch (_) {
        // fall through
      }
    }

    if (!isVerboseMode() && typeof firstArg === 'string') {
      const sanitizedFirstArg = firstArg.replace(/\u001b\[[0-9;]*m/g, '');
      const normalizedFirstArg = sanitizedFirstArg.trim();

      const stageStartMatch = normalizedFirstArg.match(/^\[StagedGazetteerCoordinator\] Starting stage: ([^\s]+)/);
      if (stageStartMatch) {
        const formatted = formatStageStart(stageStartMatch[1]);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
      }

      const stageCompleteMatch = normalizedFirstArg.match(/^\[StagedGazetteerCoordinator\] Stage '([^']+)' complete:/);
      if (stageCompleteMatch) {
        let stageStats = typeof logArgs[1] === 'object' && logArgs[1] !== null ? logArgs[1] : null;
        if (!stageStats) {
          const jsonIndex = normalizedFirstArg.indexOf('{', stageCompleteMatch[0].length);
          if (jsonIndex !== -1) {
            try {
              stageStats = JSON.parse(normalizedFirstArg.slice(jsonIndex));
            } catch (_) {
              stageStats = null;
            }
          }
        }
        const formatted = formatStageComplete(stageCompleteMatch[1], stageStats);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
      }

      if (normalizedFirstArg.startsWith('[StagedGazetteerCoordinator] All stages complete')) {
        let summaryStats = typeof logArgs[1] === 'object' && logArgs[1] !== null ? logArgs[1] : null;
        if (!summaryStats) {
          const jsonIndex = normalizedFirstArg.indexOf('{');
          if (jsonIndex !== -1) {
            try {
              summaryStats = JSON.parse(normalizedFirstArg.slice(jsonIndex));
            } catch (_) {
              summaryStats = null;
            }
          }
        }
        const formatted = formatAllStagesSummary(summaryStats);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
      }

      if (normalizedFirstArg.startsWith('[StagedGazetteerCoordinator] Running meta-planning analysis')) {
        originalConsoleLog(CLI_COLORS.muted(`${CLI_ICONS.debug} Meta-planning analysis`));
        return;
      }

      if (normalizedFirstArg.startsWith('[GazetteerPlanRunner] Start stage:')) {
        const stageKey = normalizedFirstArg.split(':')[1]?.trim() || 'stage';
        const icon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
        const color = CLI_STAGE_COLORS[stageKey] || CLI_COLORS.progress;
        originalConsoleLog(color(`${icon} ${stageKey}`));
        return;
      }

      if (normalizedFirstArg.startsWith('[GazetteerPlanRunner] Stage complete:')) {
        const stageKey = normalizedFirstArg.split(':')[1]?.trim() || 'stage';
        const icon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.complete;
        const color = CLI_STAGE_COLORS[stageKey] || CLI_COLORS.success;
        originalConsoleLog(color(`${icon} ${stageKey}`));
        return;
      }

      if (normalizedFirstArg.startsWith('[GazetteerPlanRunner] Advanced planning disabled')) {
        originalConsoleLog(CLI_COLORS.muted(`${CLI_ICONS.debug} Advanced planning disabled`));
        return;
      }

      if (normalizedFirstArg.startsWith(CLI_ICONS.progress)) {
        const candidateRaw = normalizedFirstArg.substring(CLI_ICONS.progress.length).trim();
        const normalizedCandidate = candidateRaw.replace(/^[^\w]+/, '').trim();
        const stageLabels = Object.values(CLI_STAGE_LABELS);
        const isStageEcho = stageLabels.some(label =>
          normalizedCandidate === label || normalizedCandidate.startsWith(`${label} `)
        );
        if (isStageEcho) {
          return;
        }
      }

      if (shouldSuppress(normalizedFirstArg)) {
        return;
      }

      if (normalizedFirstArg.startsWith('Enhanced features configuration')) {
        const parts = normalizedFirstArg.split(' ');
        const file = parts[parts.length - 1] || '';
        originalConsoleLog(CLI_COLORS.accent(`${CLI_ICONS.features} Enhanced features configuration loaded (use --verbose for details)`));
        return;
      }

      if (normalizedFirstArg.startsWith('Priority config loaded from')) {
        const parts = normalizedFirstArg.split(' ');
        const file = parts[parts.length - 1] || '';
        originalConsoleLog(CLI_COLORS.accent(`${CLI_ICONS.compass} Priority config loaded (${path.basename(file)})`));
        return;
      }
    }

    originalConsoleLog.apply(consoleRef, logArgs);
  };

  consoleRef.warn = function cliConsoleWarn(...warnArgs) {
    if (!isVerboseMode() && typeof warnArgs[0] === 'string' && shouldSuppress(warnArgs[0])) {
      return;
    }
    originalConsoleWarn.apply(consoleRef, warnArgs);
  };

  consoleRef.error = function cliConsoleError(...errorArgs) {
    originalConsoleError.apply(consoleRef, errorArgs);
  };

  consoleRef.info = function cliConsoleInfo(...infoArgs) {
    consoleRef.log.apply(consoleRef, infoArgs);
  };

  consoleRef.debug = function cliConsoleDebug(...debugArgs) {
    if (!isVerboseMode()) {
      return;
    }
    originalConsoleLog.apply(consoleRef, debugArgs);
  };

  const restore = () => {
    consoleRef.log = originalConsoleLog;
    consoleRef.warn = originalConsoleWarn;
    consoleRef.error = originalConsoleError;
    consoleRef.info = originalConsoleInfo;
    consoleRef.debug = originalConsoleDebug;
  };

  return {
    restore
  };
}

module.exports = {
  createCliConsoleInterceptor,
  DEFAULT_TELEMETRY_STYLES,
  DEFAULT_STARTUP_STAGE_LABELS,
  DEFAULT_MILESTONE_ICONS,
  DEFAULT_SUPPRESSED_PREFIXES
};
