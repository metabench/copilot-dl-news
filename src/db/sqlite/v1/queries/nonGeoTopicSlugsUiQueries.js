'use strict';

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function normalizeLang(value, { fallback = 'und' } = {}) {
  const lang = String(value || '').trim();
  return lang.length ? lang : fallback;
}

function normalizeSearchQuery(value) {
  const s = String(value || '').trim();
  return s.length ? s : '';
}

function selectTopicLanguages(dbHandle, { limit = 50 } = {}) {
  const resolvedLimit = clampInt(limit, { min: 1, max: 200, fallback: 50 });
  return dbHandle
    .prepare(
      `
      SELECT lang, COUNT(*) AS cnt
      FROM non_geo_topic_slugs
      GROUP BY lang
      ORDER BY cnt DESC, lang ASC
      LIMIT ?
    `
    )
    .all(resolvedLimit)
    .map((r) => ({ lang: r.lang, cnt: r.cnt }));
}

function selectTopicSlugRows(dbHandle, { lang, q, limit = 200 } = {}) {
  const resolvedLang = normalizeLang(lang);
  const resolvedQ = normalizeSearchQuery(q);
  const resolvedLimit = clampInt(limit, { min: 1, max: 2000, fallback: 200 });

  const like = resolvedQ ? `%${resolvedQ}%` : null;

  return dbHandle
    .prepare(
      `
      SELECT
        slug,
        label,
        lang,
        source,
        notes,
        created_at,
        updated_at
      FROM non_geo_topic_slugs
      WHERE lang = ?
        AND (
          ? IS NULL
          OR slug LIKE ?
          OR COALESCE(label, '') LIKE ?
        )
      ORDER BY slug ASC
      LIMIT ?
    `
    )
    .all(resolvedLang, like, like, like, resolvedLimit);
}

function upsertTopicSlugRow(dbHandle, { slug, label, lang, source, notes } = {}) {
  const resolvedSlug = String(slug || '').trim();
  if (!resolvedSlug) {
    throw new Error('upsertTopicSlugRow requires slug');
  }

  const resolvedLang = normalizeLang(lang);
  const resolvedLabel = String(label || '').trim();
  const resolvedSource = String(source || '').trim() || null;
  const resolvedNotes = String(notes || '').trim() || null;

  const stmt = dbHandle.prepare(
    `
    INSERT INTO non_geo_topic_slugs (slug, label, lang, source, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(slug, lang)
    DO UPDATE SET
      label = excluded.label,
      source = excluded.source,
      notes = excluded.notes,
      updated_at = datetime('now')
  `
  );

  return stmt.run(resolvedSlug, resolvedLabel || null, resolvedLang, resolvedSource, resolvedNotes);
}

function deleteTopicSlugRow(dbHandle, { slug, lang } = {}) {
  const resolvedSlug = String(slug || '').trim();
  const resolvedLang = normalizeLang(lang);
  if (!resolvedSlug) {
    throw new Error('deleteTopicSlugRow requires slug');
  }

  const stmt = dbHandle.prepare('DELETE FROM non_geo_topic_slugs WHERE slug = ? AND lang = ?');
  return stmt.run(resolvedSlug, resolvedLang);
}

function selectTopicSlugsForMatrix(dbHandle, { lang, fallbackLang = 'und', q, limit = 500 } = {}) {
  const resolvedLang = normalizeLang(lang);
  const resolvedFallback = normalizeLang(fallbackLang);
  const resolvedQ = normalizeSearchQuery(q);
  const resolvedLimit = clampInt(limit, { min: 1, max: 5000, fallback: 500 });
  const like = resolvedQ ? `%${resolvedQ}%` : null;

  // Default behavior: show topics that actually appear in place_hubs.
  return dbHandle
    .prepare(
      `
      WITH topic_slugs AS (
        SELECT DISTINCT ph.topic_slug AS slug
        FROM place_hubs ph
        WHERE ph.topic_slug IS NOT NULL AND ph.topic_slug != ''
      )
      SELECT
        ts.slug,
        COALESCE(t1.label, t2.label, ts.slug) AS label
      FROM topic_slugs ts
      LEFT JOIN non_geo_topic_slugs t1 ON t1.slug = ts.slug AND t1.lang = ?
      LEFT JOIN non_geo_topic_slugs t2 ON t2.slug = ts.slug AND t2.lang = ?
      WHERE (
        ? IS NULL
        OR ts.slug LIKE ?
        OR COALESCE(t1.label, t2.label, '') LIKE ?
      )
      ORDER BY label ASC, ts.slug ASC
      LIMIT ?
    `
    )
    .all(resolvedLang, resolvedFallback, like, like, like, resolvedLimit);
}

module.exports = {
  normalizeLang,
  normalizeSearchQuery,
  clampInt,
  selectTopicLanguages,
  selectTopicSlugRows,
  upsertTopicSlugRow,
  deleteTopicSlugRow,
  selectTopicSlugsForMatrix
};
