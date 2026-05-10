-- Migration: Add fetched_urls view for filtering URLs with recorded fetches
--
-- Exposes aggregated fetch metadata (first/last timestamps + count) per URL so
-- UI layers can quickly filter to entries that have been fetched at least once.
-- The view groups fetches by url_id and joins back to urls for canonical data.

DROP VIEW IF EXISTS fetched_urls;

CREATE VIEW fetched_urls AS
WITH normalized_fetches AS (
  SELECT
    hr.url_id,
    COALESCE(hr.fetched_at, hr.request_started_at) AS ts,
    hr.http_status,
    ca.classification,
    ca.word_count
  FROM http_responses hr
  LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
  LEFT JOIN content_analysis ca ON ca.content_id = cs.id
  WHERE hr.url_id IS NOT NULL
),
aggregated AS (
  SELECT
    url_id,
    MIN(ts) AS first_fetched_at,
    MAX(ts) AS last_fetched_at,
    COUNT(*) AS fetch_count
  FROM normalized_fetches
  GROUP BY url_id
),
latest AS (
  SELECT nf.url_id, nf.http_status, nf.classification, nf.word_count
  FROM normalized_fetches nf
  JOIN (
    SELECT url_id, MAX(ts) AS last_ts
    FROM normalized_fetches
    GROUP BY url_id
  ) newest
    ON newest.url_id = nf.url_id AND newest.last_ts = nf.ts
  GROUP BY nf.url_id
)
SELECT
  u.id AS url_id,
  u.url,
  u.host,
  u.canonical_url AS canonical_url,
  u.created_at AS url_created_at,
  u.last_seen_at AS url_last_seen_at,
  agg.first_fetched_at,
  agg.last_fetched_at,
  agg.fetch_count,
  latest.http_status AS last_http_status,
  latest.classification AS last_classification,
  latest.word_count AS last_word_count
FROM urls u
JOIN aggregated agg ON agg.url_id = u.id
LEFT JOIN latest ON latest.url_id = u.id;
