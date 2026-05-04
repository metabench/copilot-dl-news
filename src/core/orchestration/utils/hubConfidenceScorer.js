'use strict';

function clamp01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function getConfidenceConfig(options = {}) {
  const source = options.confidence && typeof options.confidence === 'object'
    ? options.confidence
    : options;
  const rawMode = source.mode || options.confidenceMode || 'shadow';
  const mode = ['off', 'shadow', 'enforce'].includes(String(rawMode).toLowerCase())
    ? String(rawMode).toLowerCase()
    : 'shadow';
  const threshold = clamp01(source.threshold ?? source.minConfidence ?? options.minConfidence, 0.65);

  return {
    enabled: mode !== 'off',
    mode,
    threshold,
  };
}

function scoreHubCandidate({ validation = {}, predictionSource, title, place, topic, httpStatus } = {}) {
  const signals = {};
  let score = Number.isFinite(Number(validation.confidence))
    ? clamp01(validation.confidence)
    : validation.isValid
      ? 0.6
      : 0.25;

  const status = Number(httpStatus);
  if (status >= 200 && status < 400) {
    score += 0.1;
    signals.httpOk = true;
  }

  const titleText = String(title || validation.pageTitle || '').toLowerCase();
  const placeName = String(place?.name || place?.label || '').toLowerCase();
  if (titleText && placeName && titleText.includes(placeName)) {
    score += 0.15;
    signals.titleMatchesPlace = true;
  }

  if (topic?.name || topic?.label || typeof topic === 'string') {
    score += 0.05;
    signals.topicPresent = true;
  }

  if (predictionSource) {
    score += 0.05;
    signals.predictedPattern = true;
  }

  if (Number(validation.linkCount) >= 10) {
    score += 0.1;
    signals.hasLinkDepth = true;
  }

  if (validation.isValid === false) {
    score = Math.min(score, 0.55);
  }

  const clamped = clamp01(score);
  const band = clamped >= 0.8 ? 'high' : clamped >= 0.65 ? 'medium' : clamped >= 0.4 ? 'low' : 'very-low';

  return {
    score: clamped,
    band,
    signals,
    reason: validation.reason || null,
  };
}

function applyConfidenceDecision({ validation = {}, assessment, config } = {}) {
  const activeConfig = config || getConfidenceConfig();
  const score = Number.isFinite(Number(assessment?.score)) ? assessment.score : 0;
  const rejectedByConfidence = activeConfig.enabled && activeConfig.mode === 'enforce' && score < activeConfig.threshold;

  return {
    isValid: Boolean(validation.isValid) && !rejectedByConfidence,
    rejectedByConfidence,
    reason: rejectedByConfidence ? 'confidence-threshold' : validation.reason || null,
    score,
    threshold: activeConfig.threshold,
    mode: activeConfig.mode,
  };
}

module.exports = {
  applyConfidenceDecision,
  getConfidenceConfig,
  scoreHubCandidate,
};
