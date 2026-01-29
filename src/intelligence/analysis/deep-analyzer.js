function performDeepAnalysis({
  text = null,
  title = null,
  metadata = {}
} = {}) {
  const findings = {};
  const notes = [];

  if (!text && !title) {
    notes.push('No content available for deep analysis');
    return { findings, notes, meta: { version: 1 } };
  }

  const tokens = tokenize(text || title || '');
  findings.keyPhrases = extractKeyPhrases(tokens);
  findings.sentiment = estimateSentiment(tokens);

  return {
    findings,
    notes,
    meta: {
      version: 1,
      length: tokens.length,
      ...metadata
    }
  };
}

function tokenize(content) {
  if (!content) return [];
  return content
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function extractKeyPhrases(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    if (token.length <= 3) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, frequency]) => ({ phrase, frequency }));
}

function estimateSentiment(tokens) {
  const positives = new Set(['good', 'great', 'positive', 'success', 'win', 'growth']);
  const negatives = new Set(['bad', 'poor', 'negative', 'loss', 'fail', 'decline']);

  let score = 0;
  for (const token of tokens) {
    if (positives.has(token)) score += 1;
    if (negatives.has(token)) score -= 1;
  }

  if (score > 1) return 'positive';
  if (score < -1) return 'negative';
  return 'neutral';
}

module.exports = {
  performDeepAnalysis,
  tokenize,
  extractKeyPhrases,
  estimateSentiment
};
