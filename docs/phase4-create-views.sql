-- Phase 4: Create backward compatibility views for testing
-- This view reconstructs the denormalized articles table from normalized schema

-- Create articles_view that reconstructs the original articles table structure
CREATE VIEW articles_view AS
SELECT
    -- Primary key and identity
    u.id AS id,
    u.url AS url,

    -- Content from content_analysis
    ca.title AS title,
    ca.date AS date,
    ca.section AS section,

    -- HTML content from content_storage
    cs.content_blob AS html,

    -- Timing from http_responses
    hr.fetched_at AS crawled_at,
    hr.request_started_at AS request_started_at,
    hr.fetched_at AS fetched_at,

    -- HTTP metadata from http_responses
    hr.http_status AS http_status,
    hr.content_type AS content_type,
    hr.content_length AS content_length,
    hr.etag AS etag,
    hr.last_modified AS last_modified,
    hr.redirect_chain AS redirect_chain,

    -- Timing metrics from http_responses
    hr.ttfb_ms AS ttfb_ms,
    hr.download_ms AS download_ms,
    hr.total_ms AS total_ms,
    hr.bytes_downloaded AS bytes_downloaded,
    hr.transfer_kbps AS transfer_kbps,

    -- Discovery metadata from discovery_events
    de.referrer_url AS referrer_url,
    de.discovered_at AS discovered_at,
    de.crawl_depth AS crawl_depth,

    -- Content analysis from content_analysis
    ca.word_count AS word_count,
    ca.language AS language,
    ca.article_xpath AS article_xpath,
    ca.analysis_json AS analysis,

    -- Compression info from content_storage (legacy fields)
    cs.content_sha256 AS html_sha256,
    NULL AS text,  -- Not stored separately in normalized schema
    cs.content_blob AS compressed_html,  -- Same as html for now
    cs.compression_type_id AS compression_type_id,
    NULL AS compression_bucket_id,  -- Not implemented yet
    NULL AS compression_bucket_key,  -- Not implemented yet
    cs.uncompressed_size AS original_size,
    cs.compressed_size AS compressed_size,
    cs.compression_ratio AS compression_ratio,

    -- Host from urls
    u.host AS host

FROM urls u
LEFT JOIN http_responses hr ON hr.url_id = u.id
LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
LEFT JOIN content_analysis ca ON ca.content_id = cs.id
LEFT JOIN discovery_events de ON de.url_id = u.id;

-- Create a simple validation query to test the view
-- This should return the same data as the original articles table
SELECT COUNT(*) as view_count FROM articles_view;