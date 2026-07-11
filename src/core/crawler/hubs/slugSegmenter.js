'use strict';
/**
 * slugSegmenter — interpret a hub slug into ordered typed members.
 *
 * Pure logic (no DB): takes an injectable lexicon so it is fully unit-testable
 * and reusable. A DB-backed lexicon (place_names / topic_keywords via
 * news-crawler-db accessors) is built separately in slugLexicon.js.
 *
 * Segmentation: hyphen tokens, left-to-right LONGEST-MATCH with place
 * preference. Multi-token place names ("new caledonia") beat their prefixes
 * ("new"), so new-caledonia parses as ONE place — not new + caledonia.
 * Composite slugs (russia-ukraine-war) parse as ordered [place, place, topic].
 *
 * @param {string} slug e.g. 'russia-ukraine-war'
 * @param {object} lexicon {
 *     matchPlace(phrase) -> { slug, placeId? } | null,   // phrase is space-joined lowercase
 *     matchTopic(phrase) -> { slug } | null
 *   }
 * @param {object} [opts] { maxSpan=4 }
 * @returns {{
 *   slug, hubKind: 'place'|'topic'|'composite'|'unknown',
 *   members: Array<{memberType, placeSlug?, topicSlug?, placeId?, role, position}>,
 *   confidence: number, unresolved: string[], alternatives: object[]
 * }}
 */
function segmentSlug(slug, lexicon, opts = {}) {
  const maxSpan = opts.maxSpan || 4;
  const tokens = String(slug || '').toLowerCase().split(/[-_/]+/).filter(Boolean);
  const n = tokens.length;
  const members = [];
  const unresolved = [];
  const alternatives = [];

  const phrasesAt = (i, span) => {
    const seg = tokens.slice(i, i + span);
    return [seg.join(' '), seg.join('-')];
  };

  let i = 0;
  while (i < n) {
    let matched = null;

    // Place preference: try the LONGEST place span first (multi-word names win).
    for (let span = Math.min(maxSpan, n - i); span >= 1 && !matched; span--) {
      for (const phrase of phrasesAt(i, span)) {
        const place = lexicon.matchPlace && lexicon.matchPlace(phrase);
        if (place) { matched = { memberType: 'place', span, place, phrase }; break; }
      }
    }
    // Then topics (also longest-first).
    if (!matched) {
      for (let span = Math.min(maxSpan, n - i); span >= 1 && !matched; span--) {
        for (const phrase of phrasesAt(i, span)) {
          const topic = lexicon.matchTopic && lexicon.matchTopic(phrase);
          if (topic) { matched = { memberType: 'topic', span, topic, phrase }; break; }
        }
      }
    }

    if (matched) {
      // Note a cheaper alternative parse if a shorter span ALSO matched (for review).
      if (matched.span > 1) {
        const first = tokens[i];
        const shortPlace = lexicon.matchPlace && lexicon.matchPlace(first);
        const shortTopic = !shortPlace && lexicon.matchTopic && lexicon.matchTopic(first);
        if (shortPlace || shortTopic) {
          alternatives.push({ position: members.length, chose: matched.phrase, alsoMatched: first });
        }
      }
      members.push(matched);
      i += matched.span;
    } else {
      unresolved.push(tokens[i]);
      i += 1;
    }
  }

  // Assign roles + positions + typed slugs.
  let placeSeen = 0;
  const outMembers = members.map((m, position) => {
    if (m.memberType === 'place') {
      const role = placeSeen === 0 ? 'subject' : 'counterpart';
      placeSeen += 1;
      return { memberType: 'place', placeSlug: m.place.slug, placeId: m.place.placeId ?? null, role, position };
    }
    return { memberType: 'topic', topicSlug: m.topic.slug, role: 'theme', position };
  });

  // hubKind
  const placeCount = outMembers.filter((m) => m.memberType === 'place').length;
  const topicCount = outMembers.filter((m) => m.memberType === 'topic').length;
  let hubKind = 'unknown';
  if (outMembers.length === 0) hubKind = 'unknown';
  else if (topicCount === 0 && placeCount === 1) hubKind = 'place';
  else if (placeCount === 0 && topicCount >= 1) hubKind = 'topic';
  else hubKind = 'composite';

  // Confidence: fraction of tokens resolved into members, lightly penalizing
  // any leftover unresolved tokens.
  const resolvedTokens = n - unresolved.length;
  const confidence = n === 0 ? 0 : Math.max(0, Math.min(1, resolvedTokens / n - 0.15 * (unresolved.length > 0 ? 1 : 0)));

  return {
    slug: String(slug || ''),
    hubKind,
    members: outMembers,
    confidence: Number(confidence.toFixed(3)),
    unresolved,
    alternatives
  };
}

module.exports = { segmentSlug };
