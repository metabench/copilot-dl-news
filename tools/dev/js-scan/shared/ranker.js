'use strict';

function computeRelevanceScore(match) {
  if (!match || typeof match !== 'object') {
    return 0;
  }

  let score = 0;

  const nameHits = Array.isArray(match.nameHits) ? match.nameHits.length : 0;
  const bodyHits = Array.isArray(match.bodyHits) ? match.bodyHits.length : 0;

  score += nameHits * 3;
  score += bodyHits;

  if (match.exported) {
    score += 2;
  }

  if (match.async) {
    score += 1;
  }

  if (typeof match.lines === 'number' && match.lines < 20) {
    score += 0.5;
  }

  if (typeof match.lines === 'number' && match.lines > 200) {
    score -= 0.5;
  }

  if (typeof match.depth === 'number') {
    score += Math.max(0, 2 - match.depth * 0.3);
  }

  return Math.max(0, score);
}

function scoreToStars(score) {
  if (score >= 10) return 5;
  if (score >= 7) return 4;
  if (score >= 4) return 3;
  if (score >= 2) return 2;
  if (score > 0) return 1;
  return 0;
}

function formatStars(score) {
  const stars = scoreToStars(score);
  if (stars <= 0) {
    return '';
  }
  return '★'.repeat(stars).padEnd(5, '☆');
}

module.exports = {
  computeRelevanceScore,
  scoreToStars,
  formatStars
};
