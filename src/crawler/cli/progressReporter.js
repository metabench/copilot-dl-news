const chalk = require('chalk');

const CLI_COLORS = Object.freeze({
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  progress: chalk.cyan,
  muted: chalk.gray,
  neutral: chalk.white,
  accent: chalk.magenta,
  dim: chalk.dim
});

const CLI_ICONS = Object.freeze({
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✖',
  progress: '⚙',
  pending: '⏳',
  complete: '✅',
  geography: '🌍',
  schema: '🗂',
  compass: '🧭',
  features: '🧠',
  stageCountries: '🌐',
  stageRegions: '🗺️',
  stageCities: '🏙️',
  stageBoundaries: '🛡️',
  summary: '📊',
  idle: '○',
  bullet: '•',
  debug: '…'
});

const CLI_STAGE_LABELS = Object.freeze({
  countries: 'Countries',
  adm1: 'Regions',
  adm2: 'Sub-regions',
  cities: 'Cities',
  boundaries: 'Boundaries'
});

const CLI_STAGE_ICONS = Object.freeze({
  countries: CLI_ICONS.stageCountries,
  adm1: CLI_ICONS.stageRegions,
  adm2: CLI_ICONS.stageRegions,
  cities: CLI_ICONS.stageCities,
  boundaries: CLI_ICONS.stageBoundaries
});

const CLI_STAGE_COLORS = Object.freeze({
  countries: CLI_COLORS.info,
  adm1: CLI_COLORS.accent,
  adm2: CLI_COLORS.accent,
  cities: CLI_COLORS.success,
  boundaries: CLI_COLORS.warning,
  default: CLI_COLORS.progress
});

const colorText = (colorFn, text) => (colorFn ? colorFn(text) : text);
const colorBold = (colorFn, text) => (colorFn?.bold ? colorFn.bold(text) : colorText(colorFn, text));

let verboseMode = false;

const setVerboseMode = (value) => {
  verboseMode = Boolean(value);
};

const isVerboseMode = () => verboseMode;

const formatGeographyProgress = (data) => {
  if (!data || !data.gazetteer) return null;

  const g = data.gazetteer;
  const parts = [];
  const progressPayload = g.lastProgress?.payload;

  if (g.status === 'running') {
    parts.push(CLI_COLORS.progress(CLI_ICONS.progress));
  } else if (g.status === 'completed') {
    parts.push(CLI_COLORS.success(CLI_ICONS.complete));
  } else if (g.error) {
    parts.push(CLI_COLORS.error(CLI_ICONS.error));
  } else {
    parts.push(CLI_COLORS.muted(CLI_ICONS.idle));
  }

  if (g.currentStage) {
    const stageKey = g.currentStage;
    const stageLabel = CLI_STAGE_LABELS[stageKey] || stageKey;
    const stageColor = CLI_STAGE_COLORS[stageKey] || CLI_STAGE_COLORS.default;
    const stageIcon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
    const innerPayload = (progressPayload?.phase === 'ingestor-progress') ? progressPayload?.payload : progressPayload;

    let descriptor = `${colorText(stageColor, stageIcon)} ${colorBold(stageColor, stageLabel)}`;

    if (stageKey === 'boundaries' && innerPayload?.canonicalName) {
      const locationLabel = innerPayload.countryCode
        ? `${innerPayload.canonicalName} (${innerPayload.countryCode})`
        : innerPayload.canonicalName;
      descriptor = `${descriptor} ${colorText(stageColor, locationLabel)}`;
    } else if ((stageKey === 'cities' || stageKey === 'adm1') && innerPayload?.countryCode) {
      descriptor = `${descriptor} ${colorText(stageColor, innerPayload.countryCode)}`;
    }

    parts.push(descriptor);
  }

  if (progressPayload) {
    const payload = progressPayload;

    if (payload.phase === 'stage-start') {
      parts.push(CLI_COLORS.muted(`starting (${payload.ingestorCount || 0} ingestors)`));
    } else if (payload.phase === 'ingestor-start') {
      parts.push(CLI_COLORS.muted(`ingestor: ${payload.ingestor || 'unknown'}`));
    } else if (payload.phase === 'discovery') {
      if (payload.countryCode) {
        parts.push(CLI_COLORS.muted(`country ${payload.countryCode}`));
      }
      if (payload.ingestor) {
        parts.push(CLI_COLORS.muted(`ingestor ${payload.ingestor}`));
      }
      if (payload.percentComplete != null) {
        const pct = payload.percentComplete;
        const pctColor = pct < 33 ? CLI_COLORS.error : pct < 66 ? CLI_COLORS.warning : CLI_COLORS.success;
        parts.push(pctColor(`${pct}%`));
      }
      if (payload.totalUpserted != null || payload.totalProcessed != null) {
        const upserted = payload.totalUpserted || 0;
        const processed = payload.totalProcessed || 0;
        const errors = payload.totalErrors || 0;

        if (upserted > 0) {
          parts.push(CLI_COLORS.success(`${CLI_ICONS.success}${upserted}`));
        }
        if (processed > 0) {
          parts.push(CLI_COLORS.muted(`${processed} total`));
        }
        if (errors > 0) {
          parts.push(CLI_COLORS.error(`${CLI_ICONS.error}${errors}`));
        }
      }
    } else if (payload.phase === 'processing') {
      if (payload.current != null && payload.totalItems != null) {
        parts.push(CLI_COLORS.neutral(`[${payload.current}/${payload.totalItems}]`));
      }

      if (payload.citiesProcessed != null) {
        parts.push(CLI_COLORS.muted(`${payload.citiesProcessed} cities`));
      } else if (payload.regionsProcessed != null) {
        parts.push(CLI_COLORS.muted(`${payload.regionsProcessed} regions`));
      }

      if (payload.percentComplete != null) {
        const pct = payload.percentComplete;
        const pctColor = pct < 33 ? CLI_COLORS.error : pct < 66 ? CLI_COLORS.warning : CLI_COLORS.success;
        parts.push(pctColor(`${pct}%`));
      }

      if (payload.totalUpserted != null || payload.totalProcessed != null) {
        const upserted = payload.totalUpserted || 0;
        const processed = payload.totalProcessed || 0;
        const errors = payload.totalErrors || 0;

        if (upserted > 0) {
          parts.push(CLI_COLORS.success(`${CLI_ICONS.success}${upserted}`));
        }
        if (processed > 0) {
          parts.push(CLI_COLORS.muted(`${processed} total`));
        }
        if (errors > 0) {
          parts.push(CLI_COLORS.error(`${CLI_ICONS.error}${errors}`));
        }
      }
    }

    if (payload.timing && payload.timing.estimatedRemainingMs != null) {
      const remainingSec = Math.round(payload.timing.estimatedRemainingMs / 1000);
      const remainingMin = Math.floor(remainingSec / 60);
      if (remainingMin > 0) {
        parts.push(CLI_COLORS.dim(`~${remainingMin}m left`));
      } else if (remainingSec > 0) {
        parts.push(CLI_COLORS.dim(`~${remainingSec}s left`));
      }
    }

    if (payload.message && !payload.countryCode) {
      parts.push(CLI_COLORS.muted(payload.message));
    }
  }

  return parts.join(' ');
};

const formatStageStart = (stageKey) => {
  if (!stageKey) return null;
  const label = CLI_STAGE_LABELS[stageKey] || stageKey;
  const colorFn = CLI_STAGE_COLORS[stageKey] || CLI_STAGE_COLORS.default;
  const icon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
  const statusIcon = CLI_COLORS.progress(CLI_ICONS.pending);
  const stageIcon = colorText(colorFn, icon);
  const stageLabel = colorBold(colorFn, label);
  return `${statusIcon} ${stageIcon} ${stageLabel} ${CLI_COLORS.muted('starting')}`;
};

const formatStageComplete = (stageKey, stats) => {
  if (!stageKey) return null;
  const summary = stats && typeof stats === 'object' ? stats : null;
  const label = CLI_STAGE_LABELS[stageKey] || stageKey;
  const colorFn = CLI_STAGE_COLORS[stageKey] || CLI_STAGE_COLORS.default;
  const icon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
  const stageIcon = colorText(colorFn, icon);
  const stageLabel = colorBold(colorFn, label);

  const processed = summary?.recordsProcessed;
  const upserted = summary?.recordsUpserted;
  const errors = summary?.errors;
  const ingestors = summary?.ingestorsCompleted ?? summary?.ingestorsAttempted;

  const detailParts = [];
  if (processed != null) {
    detailParts.push(CLI_COLORS.muted(`${processed} processed`));
  }
  if (upserted != null) {
    detailParts.push(upserted > 0
      ? CLI_COLORS.success(`${CLI_ICONS.success}${upserted} new`)
      : CLI_COLORS.muted('0 new'));
  }
  if (errors != null) {
    detailParts.push(errors > 0
      ? CLI_COLORS.error(`${CLI_ICONS.error}${errors}`)
      : CLI_COLORS.muted('0 errors'));
  }
  if (ingestors != null) {
    detailParts.push(CLI_COLORS.muted(`${ingestors} ingestor${ingestors === 1 ? '' : 's'}`));
  }

  const bullet = CLI_COLORS.muted(` ${CLI_ICONS.bullet} `);
  const detailText = detailParts.filter(Boolean).join(bullet);
  return `${CLI_COLORS.success(CLI_ICONS.complete)} ${stageIcon} ${stageLabel}${detailText ? ' ' + detailText : ''}`;
};

const formatAllStagesSummary = (summary) => {
  if (!summary || typeof summary !== 'object') return null;
  const stages = summary.stagesCompleted ?? summary.stagesAttempted;
  const processed = summary.recordsProcessed;
  const upserted = summary.recordsUpserted;
  const errors = summary.errors;

  const detailParts = [];
  if (stages != null) {
    detailParts.push(CLI_COLORS.muted(`${stages} stages`));
  }
  if (processed != null) {
    detailParts.push(CLI_COLORS.muted(`${processed} processed`));
  }
  if (upserted != null) {
    detailParts.push(upserted > 0
      ? CLI_COLORS.success(`${CLI_ICONS.success}${upserted} new`)
      : CLI_COLORS.muted('0 new'));
  }
  if (errors != null) {
    detailParts.push(errors > 0
      ? CLI_COLORS.error(`${CLI_ICONS.error}${errors}`)
      : CLI_COLORS.muted('0 errors'));
  }

  const bullet = CLI_COLORS.muted(` ${CLI_ICONS.bullet} `);
  const detailText = detailParts.filter(Boolean).join(bullet);
  return `${CLI_COLORS.success(CLI_ICONS.summary)} ${colorBold(CLI_COLORS.success, 'Gazetteer summary')}${detailText ? ' ' + detailText : ''}`;
};

const createCliLogger = ({ stdout = console.log, stderr = console.error } = {}) => ({
  success: (msg) => stdout(CLI_COLORS.success(CLI_ICONS.success), msg),
  error: (msg) => stdout(CLI_COLORS.error(CLI_ICONS.error), msg),
  warn: (msg) => stdout(CLI_COLORS.warning(CLI_ICONS.warning), msg),
  info: (msg) => stdout(CLI_COLORS.info(CLI_ICONS.info), msg),
  progress: (stage, current, total, details = '') => {
    const pct = Math.round((current / total) * 100);
    const filled = Math.max(0, Math.min(20, Math.floor(pct / 5)));
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    const detailText = details ? CLI_COLORS.muted(` ${details}`) : '';
    stdout(CLI_COLORS.progress(`[${bar}] ${pct}% ${stage}`) + detailText);
  },
  stat: (label, value) => stdout(CLI_COLORS.muted(`${label}:`), CLI_COLORS.neutral(value)),
  debug: (...args) => {
    if (isVerboseMode()) {
      stderr(CLI_COLORS.dim('[DEBUG]'), ...args);
    }
  },
  formatGeographyProgress
});

module.exports = {
  CLI_COLORS,
  CLI_ICONS,
  CLI_STAGE_LABELS,
  CLI_STAGE_ICONS,
  CLI_STAGE_COLORS,
  colorText,
  colorBold,
  createCliLogger,
  setVerboseMode,
  isVerboseMode,
  formatGeographyProgress,
  formatStageStart,
  formatStageComplete,
  formatAllStagesSummary
};
