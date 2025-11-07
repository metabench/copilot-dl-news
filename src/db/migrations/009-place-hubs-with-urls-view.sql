-- Place Hubs URL View Migration
-- Version: 009
-- Description: Create view joining place_hubs with urls to expose canonical URL text

DROP VIEW IF EXISTS place_hubs_with_urls;

CREATE VIEW place_hubs_with_urls AS
SELECT
  ph.id,
  ph.host,
  ph.place_slug,
  ph.title,
  ph.first_seen_at,
  ph.last_seen_at,
  ph.nav_links_count,
  ph.article_links_count,
  ph.evidence,
  ph.place_kind,
  ph.topic_slug,
  ph.topic_label,
  ph.topic_kind,
  ph.url_id,
  u.url
FROM place_hubs ph
LEFT JOIN urls u ON u.id = ph.url_id;

INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
VALUES (9, '009-place-hubs-with-urls-view', datetime('now'), 'Create view joining place_hubs to urls for hub URL access');
