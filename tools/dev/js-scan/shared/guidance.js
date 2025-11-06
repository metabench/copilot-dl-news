'use strict';

function buildGuidance(context, options = {}) {
  if (!context || typeof context !== 'object') {
    return { triggered: false, suggestions: [] };
  }

  const suggestions = [];
  let reason = null;

  if (context.totalMatches === 0) {
    reason = 'zero-matches';
    suggestions.push(
      {
        category: 'expand',
        action: 'adjust-terms',
        example: '--search "term another"',
        rationale: 'Try adding related keywords or removing filters.'
      },
      {
        category: 'expand',
        action: 'widen-scope',
        example: '--dir src',
        rationale: 'Broaden the directory scope to include more files.'
      }
    );
  } else if (context.totalMatches > context.displayed) {
    reason = 'high-match-count';
    suggestions.push(
      {
        category: 'refine',
        action: 'add-filter',
        example: '--exported --async',
        rationale: 'Limit results to exported async functions if that fits your query.'
      },
      {
        category: 'target',
        action: 'change-dir',
        example: `--dir ${context.topDirectory || 'src/utils'}`,
        rationale: 'Focus on the directory where most matches were found.'
      },
      {
        category: 'expand',
        action: 'increase-limit',
        example: '--limit 50 --max-lines 400',
        rationale: 'Show more matches if you need to review a broader set.'
      }
    );
  } else if (context.averageStars && context.averageStars < 2) {
    reason = 'low-relevance';
    suggestions.push(
      {
        category: 'refine',
        action: 'add-term',
        example: '--search "core term"',
        rationale: 'Add more specific terms to boost relevance.'
      }
    );
  }

  if (!reason) {
    return { triggered: false, suggestions: [] };
  }

  return {
    triggered: true,
    reason,
    suggestions,
    stats: {
      matchCount: context.totalMatches,
      displayed: context.displayed,
      truncated: context.totalMatches > context.displayed,
      avgStars: context.averageStars,
      exportedRatio: context.exportedRatio,
      asyncRatio: context.asyncRatio,
      topDirectory: context.topDirectory
    }
  };
}

module.exports = {
  buildGuidance
};
