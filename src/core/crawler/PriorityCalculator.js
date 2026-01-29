/**
 * PriorityCalculator - centralizes base priority calculation logic
 * Provides computeBasePriority for enhanced scoring and compute for simple callers
 */
function _computeBasePriority({ type, depth, discoveredAt, bias = 0 } = {}) {
  let kind = type;
  if (type && typeof type === 'object') {
    kind = type.kind || type.type || type.intent;
  }
  const normalizedKind = typeof kind === 'string' ? kind : 'nav';

  let typeWeight;
  switch (normalizedKind) {
    case 'article':
      typeWeight = 0;
      break;
    case 'hub-seed':
      typeWeight = 4;
      break;
    case 'history':
      typeWeight = 6;
      break;
    case 'nav':
      typeWeight = 10;
      break;
    case 'refresh':
      typeWeight = 25;
      break;
    default:
      typeWeight = 12;
      break;
  }
  const depthPenalty = depth || 0;
  const tieBreaker = discoveredAt || 0;
  return typeWeight + depthPenalty + bias + tieBreaker * 1e-9;
}

class PriorityCalculator {
  constructor() {}
  compute({ type, depth, discoveredAt, bias = 0 } = {}) {
    return _computeBasePriority({ type, depth, discoveredAt, bias });
  }
  computeBase(args) {
    return _computeBasePriority(args);
  }
}

module.exports = PriorityCalculator;
