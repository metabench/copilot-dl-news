-- Articles View (metadata-only) Migration
-- Version: 011
-- Description: Recreate articles_view without exposing raw/compressed HTML blobs

DROP VIEW IF EXISTS articles_view;

CREATE VIEW articles_view AS
SELECT
  u.id AS id,
  u.url AS url,
  ca.title AS title,
  ca.date AS date,
  ca.section AS section,
  hr.fetched_at AS crawled_at,
  hr.request_started_at AS request_started_at,
  hr.fetched_at AS fetched_at,
  hr.http_status AS http_status,
  hr.content_type AS content_type,
  NULL AS content_length,
  hr.etag AS etag,
  hr.last_modified AS last_modified,
  hr.redirect_chain AS redirect_chain,
  hr.ttfb_ms AS ttfb_ms,
  hr.download_ms AS download_ms,
  hr.total_ms AS total_ms,
  hr.bytes_downloaded AS bytes_downloaded,
  hr.transfer_kbps AS transfer_kbps,
  de.referrer_url AS referrer_url,
  de.discovered_at AS discovered_at,
  de.crawl_depth AS crawl_depth,
  ca.word_count AS word_count,
  ca.language AS language,
  ca.article_xpath AS article_xpath,
  ca.analysis_json AS analysis,
  cs.content_sha256 AS html_sha256,
  cs.compression_type_id AS compression_type_id,
  cs.compression_bucket_id AS compression_bucket_id,
  cs.bucket_entry_key AS compression_bucket_key,
  cs.uncompressed_size AS original_size,
  cs.compressed_size AS compressed_size,
  cs.compression_ratio AS compression_ratio,
  u.host AS host
FROM urls u
LEFT JOIN http_responses hr ON hr.url_id = u.id
LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
LEFT JOIN content_analysis ca ON ca.content_id = cs.id
LEFT JOIN discovery_events de ON de.url_id = u.id;

INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
VALUES (11, '011-articles-view-no-html', datetime('now'), 'Trim raw/compressed HTML columns from articles_view');
