CREATE table IF NOT EXISTS analysis_run_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          stage TEXT,
          message TEXT,
          details TEXT,
          FOREIGN KEY(run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
        );

CREATE table IF NOT EXISTS analysis_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          status TEXT NOT NULL,
          stage TEXT,
          analysis_version INTEGER,
          page_limit INTEGER,
          domain_limit INTEGER,
          skip_pages INTEGER,
          skip_domains INTEGER,
          dry_run INTEGER,
          verbose INTEGER,
          summary TEXT,
          last_progress TEXT,
          error TEXT
        , background_task_id INTEGER, background_task_status TEXT);

CREATE table IF NOT EXISTS article_place_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER NOT NULL,
        place_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL CHECK(relation_type IN ('primary', 'secondary', 'mentioned', 'affected', 'origin')),
        confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
        matching_rule_level INTEGER NOT NULL DEFAULT 0,
        evidence TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (article_id) REFERENCES http_responses(id) ON DELETE CASCADE,
        FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
        UNIQUE(article_id, place_id, matching_rule_level)
      );

CREATE table IF NOT EXISTS article_places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place TEXT NOT NULL,
        place_kind TEXT,      -- country | region | city | other
        method TEXT,          -- gazetteer | heuristic | other
        source TEXT,          -- title | text | metadata
        offset_start INTEGER,
        offset_end INTEGER,
        context TEXT,
      first_seen_at TEXT,
      article_url_id INTEGER NOT NULL REFERENCES urls(id),
      UNIQUE(article_url_id, place, source, offset_start, offset_end)
      );

CREATE table IF NOT EXISTS article_xpath_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  domain_id INTEGER REFERENCES domains(id),
  xpath TEXT NOT NULL,
  confidence REAL,
  learned_from TEXT,
  learned_at TEXT,
  sample_text_length INTEGER,
  paragraph_count INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  metadata TEXT
);

CREATE table IF NOT EXISTS background_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'resuming', 'running', 'paused', 'completed', 'failed', 'cancelled')),
      progress_current INTEGER DEFAULT 0,
      progress_total INTEGER DEFAULT 0,
      progress_message TEXT,
      config TEXT, -- JSON configuration
      metadata TEXT, -- JSON metadata
      error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      resume_started_at TEXT
    );

CREATE table IF NOT EXISTS bucket_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_id INTEGER NOT NULL REFERENCES compression_buckets(id),
  entry_key TEXT NOT NULL,
  uncompressed_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bucket_id, entry_key)
);

CREATE table IF NOT EXISTS compression_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket_type TEXT NOT NULL,
      domain_pattern TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finalized_at TEXT,
      content_count INTEGER DEFAULT 0,
      uncompressed_size INTEGER DEFAULT 0,
      compressed_size INTEGER DEFAULT 0,
      compression_ratio REAL,
      compression_type_id INTEGER REFERENCES compression_types(id),
      bucket_blob BLOB,
      index_json TEXT
    , status TEXT);

CREATE table IF NOT EXISTS compression_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_analyzed_at TEXT,
      analysis_version INTEGER,
      analysed_pages INTEGER DEFAULT 0,
      pages_updated INTEGER DEFAULT 0,
      skipped_pages INTEGER DEFAULT 0,
      last_run_summary TEXT,
      total_items INTEGER DEFAULT 0,
      uncompressed_items INTEGER DEFAULT 0,
      total_uncompressed_bytes INTEGER DEFAULT 0,
      total_compressed_bytes INTEGER DEFAULT 0,
      total_space_saved_bytes INTEGER DEFAULT 0,
      avg_compression_ratio REAL,
      compression_types_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE table IF NOT EXISTS compression_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      algorithm TEXT NOT NULL,
      level INTEGER NOT NULL,
      mime_type TEXT,
      extension TEXT,
      memory_mb INTEGER DEFAULT 0,
      window_bits INTEGER,
      block_bits INTEGER,
      description TEXT
    );

CREATE table IF NOT EXISTS content_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL REFERENCES content_storage(id),
      analysis_version INTEGER NOT NULL DEFAULT 1,
      classification TEXT,
      title TEXT,
      date TEXT,
      section TEXT,
      word_count INTEGER,
      language TEXT,
      article_xpath TEXT,
      nav_links_count INTEGER,
      article_links_count INTEGER,
      analysis_json TEXT,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE table IF NOT EXISTS content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_type TEXT NOT NULL,
      compression_type_id INTEGER REFERENCES compression_types(id),
      compression_bucket_id INTEGER REFERENCES compression_buckets(id),
      bucket_entry_key TEXT,
      content_blob BLOB,
      content_sha256 TEXT,
      uncompressed_size INTEGER,
      compressed_size INTEGER,
      compression_ratio REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    , http_response_id INTEGER REFERENCES http_responses(id), content_category TEXT, content_subtype TEXT);

CREATE table IF NOT EXISTS coverage_gaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        gap_type TEXT NOT NULL,
        gap_identifier TEXT NOT NULL,
        gap_description TEXT,
        priority_score REAL DEFAULT 0,
        first_detected TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        resolution_status TEXT DEFAULT 'open',
        resolution_method TEXT,
        resolved_at TEXT,
        attempts_count INTEGER DEFAULT 0,
        metadata TEXT,
        UNIQUE(job_id, gap_type, gap_identifier)
      );

CREATE table IF NOT EXISTS coverage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        snapshot_time TEXT NOT NULL,
        domain TEXT NOT NULL,
        total_hubs_expected INTEGER,
        total_hubs_discovered INTEGER,
        coverage_percentage REAL,
        gap_count INTEGER,
        active_problems INTEGER,
        milestone_count INTEGER,
        telemetry_data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

CREATE table IF NOT EXISTS "crawl_jobs" (id TEXT PRIMARY KEY, args TEXT, pid INTEGER, started_at TEXT, ended_at TEXT, status TEXT, crawl_type_id INTEGER, url_id INTEGER);

CREATE table IF NOT EXISTS crawl_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            scope TEXT,
            target TEXT,
            message TEXT,
            details TEXT
          );

CREATE table IF NOT EXISTS crawl_problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            scope TEXT,
            target TEXT,
            message TEXT,
            details TEXT
          );

CREATE table IF NOT EXISTS crawl_skip_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      reason TEXT,
      source TEXT,
      metadata JSON
    );

CREATE table IF NOT EXISTS crawl_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          host TEXT,
          kind TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          url TEXT,
          payload TEXT,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
        );

CREATE table IF NOT EXISTS crawl_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          declaration TEXT NOT NULL -- JSON string describing flags/behavior
        );

CREATE table IF NOT EXISTS crawler_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

CREATE table IF NOT EXISTS cross_crawl_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_domain TEXT NOT NULL,
        knowledge_type TEXT NOT NULL,
        knowledge_key TEXT NOT NULL,
        knowledge_value TEXT NOT NULL,
        confidence_level REAL NOT NULL,
        usage_count INTEGER DEFAULT 0,
        last_used TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(source_domain, knowledge_type, knowledge_key)
      );

CREATE table IF NOT EXISTS dashboard_metrics (
        job_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metric_unit TEXT,
        timestamp TEXT NOT NULL,
        aggregation_period TEXT DEFAULT 'instant',
        metadata TEXT,
        PRIMARY KEY (job_id, metric_name, timestamp)
      ) WITHOUT ROWID;

CREATE table IF NOT EXISTS discovery_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id),
      discovered_at TEXT NOT NULL,
      referrer_url TEXT,
      crawl_depth INTEGER,
      discovery_method TEXT,
      crawl_job_id TEXT REFERENCES crawl_jobs(id)
    );

CREATE table IF NOT EXISTS domain_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

CREATE table IF NOT EXISTS domain_category_map (
        domain_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (domain_id, category_id),
        FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES domain_categories(id) ON DELETE CASCADE
      );

CREATE table IF NOT EXISTS domain_locales (
      host TEXT PRIMARY KEY,
      country_code TEXT,
      primary_langs TEXT,                  -- CSV or JSON of language tags
      confidence REAL,
      source TEXT,
      updated_at TEXT
    );

CREATE table IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL UNIQUE,
        tld TEXT,
        created_at TEXT,
        last_seen_at TEXT,
        analysis TEXT
      );

CREATE table IF NOT EXISTS "errors" (id INTEGER PRIMARY KEY, host TEXT, kind TEXT, code INTEGER, message TEXT, details TEXT, at TEXT, url_id INTEGER);

CREATE table IF NOT EXISTS "fetches" (id INTEGER PRIMARY KEY, request_started_at TEXT, fetched_at TEXT, http_status INTEGER, content_type TEXT, content_length INTEGER, content_encoding TEXT, bytes_downloaded INTEGER, transfer_kbps REAL, ttfb_ms INTEGER, download_ms INTEGER, total_ms INTEGER, saved_to_db INTEGER, saved_to_file INTEGER, file_path TEXT, file_size INTEGER, classification TEXT, nav_links_count INTEGER, article_links_count INTEGER, word_count INTEGER, analysis TEXT, host TEXT, url_id INTEGER);

CREATE table IF NOT EXISTS gap_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        predicted_url TEXT NOT NULL,
        prediction_source TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        gap_type TEXT,
        expected_coverage_lift REAL,
        validation_status TEXT DEFAULT 'pending',
        validation_result TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        validated_at TEXT,
        UNIQUE(job_id, predicted_url)
      );

CREATE table IF NOT EXISTS gazetteer_crawl_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL,                 -- countries | adm1 | adm2 | cities | osm_boundaries
      status TEXT NOT NULL,                -- pending | in_progress | completed | failed
      started_at INTEGER,
      completed_at INTEGER,
      records_total INTEGER DEFAULT 0,
      records_processed INTEGER DEFAULT 0,
      records_upserted INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      error_message TEXT,
      metadata JSON
    );

CREATE table IF NOT EXISTS http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id),
      request_started_at TEXT NOT NULL,
      fetched_at TEXT,
      http_status INTEGER,
      content_type TEXT,
      content_encoding TEXT,
      etag TEXT,
      last_modified TEXT,
      redirect_chain TEXT,
      ttfb_ms INTEGER,
      download_ms INTEGER,
      total_ms INTEGER,
      bytes_downloaded INTEGER,
      transfer_kbps REAL
    , cache_category TEXT, cache_key TEXT, cache_created_at TEXT, cache_expires_at TEXT, request_method TEXT DEFAULT 'GET');

CREATE table IF NOT EXISTS hub_discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        hub_url TEXT NOT NULL,
        hub_type TEXT,
        discovery_method TEXT NOT NULL,
        confidence_score REAL,
        classification_reason TEXT,
        gap_filled BOOLEAN DEFAULT 0,
        coverage_impact REAL,
        metadata TEXT, hub_url_id INTEGER,
        UNIQUE(job_id, hub_url)
      );

CREATE table IF NOT EXISTS hub_validations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        hub_url TEXT NOT NULL,
        hub_type TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        classification_confidence REAL,
        last_fetch_status INTEGER,
        content_indicators TEXT,
        validation_method TEXT,
        validated_at TEXT NOT NULL,
        expires_at TEXT,
        revalidation_priority INTEGER DEFAULT 0,
        metadata TEXT, hub_url_id INTEGER,
        UNIQUE(domain, hub_url)
      );

CREATE table IF NOT EXISTS ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,                -- Source name (restcountries, wikidata, osm, etc.)
      source_version TEXT,                 -- Source version (v3.1, latest, etc.)
      started_at INTEGER NOT NULL,         -- Unix timestamp
      completed_at INTEGER,                -- Unix timestamp
      status TEXT DEFAULT 'running',       -- running | completed | failed
      countries_processed INTEGER,
      places_created INTEGER,
      places_updated INTEGER,
      names_added INTEGER,
      error_message TEXT,
      metadata JSON                        -- Additional run metadata
    );

CREATE table IF NOT EXISTS knowledge_reuse_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        reuse_type TEXT NOT NULL,
        source_pattern_id INTEGER,
        source_hub_id INTEGER,
        reused_url TEXT,
        success_outcome BOOLEAN,
        time_saved_ms INTEGER,
        confidence_at_reuse REAL,
        outcome_details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_pattern_id) REFERENCES planner_patterns(id),
        FOREIGN KEY (source_hub_id) REFERENCES hub_validations(id)
      );

CREATE table IF NOT EXISTS latest_fetch (
  url TEXT PRIMARY KEY,
  ts TEXT,
  http_status INTEGER,
  classification TEXT,
  word_count INTEGER
);

CREATE table IF NOT EXISTS "links" (id INTEGER PRIMARY KEY, anchor TEXT, rel TEXT, type TEXT, depth INTEGER, on_domain INTEGER, discovered_at TEXT NOT NULL, src_url_id INTEGER, dst_url_id INTEGER);

CREATE table IF NOT EXISTS milestone_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        milestone_type TEXT NOT NULL,
        achieved_at TEXT NOT NULL,
        threshold_value REAL,
        actual_value REAL,
        improvement_percentage REAL,
        context_data TEXT,
        celebration_level TEXT DEFAULT 'normal'
      );

CREATE table IF NOT EXISTS news_websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        label TEXT,
        parent_domain TEXT,
        url_pattern TEXT NOT NULL,
        website_type TEXT NOT NULL,
        added_at TEXT NOT NULL,
        added_by TEXT,
        enabled INTEGER DEFAULT 1,
        metadata TEXT
      );

CREATE table IF NOT EXISTS news_websites_stats_cache (
        website_id INTEGER PRIMARY KEY,
        
        -- Article statistics
        article_count INTEGER DEFAULT 0,
        article_latest_date TEXT,
        article_latest_crawled_at TEXT,
        article_first_seen_at TEXT,
        
        -- Fetch statistics  
        fetch_count INTEGER DEFAULT 0,
        fetch_ok_count INTEGER DEFAULT 0,
        fetch_error_count INTEGER DEFAULT 0,
        fetch_last_at TEXT,
        fetch_first_at TEXT,
        
        -- HTTP status distribution (top 5)
        status_200_count INTEGER DEFAULT 0,
        status_404_count INTEGER DEFAULT 0,
        status_403_count INTEGER DEFAULT 0,
        status_500_count INTEGER DEFAULT 0,
        status_503_count INTEGER DEFAULT 0,
        
        -- Content statistics
        avg_article_size_bytes INTEGER DEFAULT 0,
        total_content_bytes INTEGER DEFAULT 0,
        
        -- Crawl performance
        avg_fetch_time_ms INTEGER DEFAULT 0,
        successful_crawls INTEGER DEFAULT 0,
        failed_crawls INTEGER DEFAULT 0,
        
        -- Time statistics
        last_updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        cache_version INTEGER DEFAULT 1,
        
        FOREIGN KEY (website_id) REFERENCES news_websites(id) ON DELETE CASCADE
      );

CREATE table IF NOT EXISTS non_geo_topic_slugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      label TEXT,
      lang TEXT NOT NULL DEFAULT 'und',
      source TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(slug, lang)
    );

CREATE table IF NOT EXISTS page_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

CREATE table IF NOT EXISTS page_category_map (
        fetch_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (fetch_id, category_id),
        FOREIGN KEY (fetch_id) REFERENCES fetches(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES page_categories(id) ON DELETE CASCADE
      );

CREATE table IF NOT EXISTS place_attribute_values (
      place_id INTEGER NOT NULL,
      attr TEXT NOT NULL,
      source TEXT NOT NULL,
      value_json TEXT,
      confidence REAL,
      fetched_at INTEGER,
      metadata JSON,
      PRIMARY KEY (place_id, attr, source),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE table IF NOT EXISTS place_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL REFERENCES places(id),
      attribute_kind TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      fetched_at INTEGER,
      confidence REAL,
      metadata TEXT,
      UNIQUE(place_id, attribute_kind, source)
    );

CREATE table IF NOT EXISTS place_external_ids (
      source TEXT NOT NULL,
      ext_id TEXT NOT NULL,
      place_id INTEGER NOT NULL,
      PRIMARY KEY (source, ext_id),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE table IF NOT EXISTS place_hierarchy (
      parent_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      relation TEXT,                       -- admin_parent | contains | member_of
      depth INTEGER,
      PRIMARY KEY (parent_id, child_id),
      FOREIGN KEY (parent_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE table IF NOT EXISTS place_hub_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      url TEXT NOT NULL,
      place_kind TEXT,
      place_name TEXT,
      decision TEXT NOT NULL,
      validation_metrics_json TEXT,
      attempt_id TEXT,
      run_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

CREATE table IF NOT EXISTS "place_hub_candidates" (id INTEGER PRIMARY KEY, domain TEXT NOT NULL, place_kind TEXT, place_name TEXT, place_code TEXT, place_id INTEGER, analyzer TEXT, strategy TEXT, score REAL, confidence REAL, pattern TEXT, signals_json TEXT, attempt_id TEXT, attempt_started_at TEXT, status TEXT DEFAULT 'pending', validation_status TEXT, source TEXT DEFAULT 'guess-place-hubs', last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), candidate_url_id INTEGER, normalized_url_id INTEGER);

CREATE table IF NOT EXISTS place_hub_determinations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        determination TEXT NOT NULL,
        reason TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

CREATE table IF NOT EXISTS place_hub_guess_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      stage TEXT,

      -- Hub guessing specific parameters
      domain_count INTEGER,
      total_domains INTEGER,
      kinds TEXT, -- JSON array of hub kinds
      limit_per_domain INTEGER,
      apply_changes INTEGER, -- 0/1 for boolean
      emit_report INTEGER, -- 0/1 for boolean
      report_path TEXT,
      readiness_timeout_seconds INTEGER,
      enable_topic_discovery INTEGER, -- 0/1 for boolean

      -- Results summary
      domains_processed INTEGER DEFAULT 0,
      hubs_generated INTEGER DEFAULT 0,
      hubs_validated INTEGER DEFAULT 0,
      hubs_persisted INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,

      -- Timing
      duration_ms INTEGER,

      -- Background task linkage (like analysis_runs)
      background_task_id INTEGER,
      background_task_status TEXT,

      -- Additional metadata
      summary TEXT,
      last_progress TEXT,
      error TEXT,

      FOREIGN KEY (background_task_id) REFERENCES background_tasks(id)
    );

CREATE table IF NOT EXISTS "place_hub_unknown_terms" (id INTEGER PRIMARY KEY, host TEXT NOT NULL, term_slug TEXT NOT NULL, term_label TEXT, source TEXT, reason TEXT, confidence TEXT, evidence TEXT, occurrences INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen_at TEXT NOT NULL DEFAULT (datetime('now')), url_id INTEGER, canonical_url_id INTEGER);

CREATE table IF NOT EXISTS "place_hubs" (id INTEGER PRIMARY KEY, host TEXT NOT NULL, place_slug TEXT, title TEXT, first_seen_at TEXT, last_seen_at TEXT, nav_links_count INTEGER, article_links_count INTEGER, evidence TEXT, place_kind TEXT, topic_slug TEXT, topic_label TEXT, topic_kind TEXT, url_id INTEGER);

CREATE table IF NOT EXISTS place_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized TEXT,                     -- lowercased/diacritics-free for matching
      lang TEXT,                           -- BCP-47 (e.g., en, fr, zh-Hans)
      script TEXT,                         -- optional ISO 15924
      name_kind TEXT,                      -- endonym | exonym | alias | abbrev | official | common | demonym
      is_preferred INTEGER,                -- 0/1
      is_official INTEGER,                 -- 0/1
      source TEXT,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE table IF NOT EXISTS place_page_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      host TEXT NOT NULL,
      url TEXT NOT NULL,
      page_kind TEXT NOT NULL DEFAULT 'country-hub',
      publisher TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      verified_at TEXT,
      evidence JSON,
      hub_id INTEGER,
      UNIQUE(place_id, host, page_kind),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (hub_id) REFERENCES place_hubs(id) ON DELETE SET NULL
    );

CREATE table IF NOT EXISTS place_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL REFERENCES places(id),
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      fetched_at INTEGER,
      raw_data TEXT,
      UNIQUE(place_id, source, external_id)
    );

CREATE table IF NOT EXISTS place_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT,
      url TEXT,
      license TEXT
    );

CREATE table IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,                  -- country | region | city | poi | supranational
      country_code TEXT,                   -- ISO-3166 alpha-2 when applicable
      adm1_code TEXT,                      -- first-level admin code when applicable
      adm2_code TEXT,                      -- second-level admin code when applicable
      population INTEGER,
      timezone TEXT,
      lat REAL,
      lng REAL,
      bbox TEXT,                           -- JSON [west,south,east,north] when available
      canonical_name_id INTEGER,           -- references place_names.id (optional)
      source TEXT,                         -- provenance (e.g., restcountries@v3)
      extra JSON                           -- JSON blob for source-specific data
    , status TEXT DEFAULT 'current', valid_from TEXT, valid_to TEXT, wikidata_qid TEXT, osm_type TEXT, osm_id TEXT, area REAL, gdp_usd REAL, wikidata_admin_level INTEGER, wikidata_props JSON, osm_tags JSON, crawl_depth INTEGER DEFAULT 0, priority_score REAL, last_crawled_at INTEGER);

CREATE table IF NOT EXISTS planner_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        pattern_regex TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        confidence_score REAL DEFAULT 0.0,
        last_validated TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(domain, pattern_type, pattern_regex)
      );

CREATE table IF NOT EXISTS planner_stage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        sequence INTEGER,
        duration_ms INTEGER,
        details TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
      );

CREATE table IF NOT EXISTS priority_config_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        changed_at TEXT DEFAULT (datetime('now')),
        changed_by TEXT,
        change_type TEXT NOT NULL,
        old_values TEXT,
        new_values TEXT,
        impact_assessment TEXT
      );

CREATE table IF NOT EXISTS problem_clusters (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        scope TEXT,
        target TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        priority_boost REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        cluster_metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

CREATE table IF NOT EXISTS query_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_type TEXT NOT NULL,           -- e.g., 'fetch_articles', 'lookup_place', 'analyze_domain'
      operation TEXT NOT NULL,            -- e.g., 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
      duration_ms REAL NOT NULL,          -- Query execution time in milliseconds
      result_count INTEGER DEFAULT 0,     -- Number of rows returned or affected
      query_complexity TEXT,              -- 'simple' | 'moderate' | 'complex' (based on query structure)
      host TEXT,                          -- Domain being queried (if applicable)
      job_id TEXT,                        -- Crawl job ID (if applicable)
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT                       -- JSON: { table, filters, joins, error, etc. }
    , created_at TEXT);

CREATE table IF NOT EXISTS "queue_events" (id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, ts TEXT NOT NULL, action TEXT NOT NULL, depth INTEGER, host TEXT, reason TEXT, queue_size INTEGER, alias TEXT, queue_origin TEXT, queue_role TEXT, queue_depth_bucket TEXT, url_id INTEGER);

CREATE table IF NOT EXISTS queue_events_enhanced (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          action TEXT NOT NULL,
          url TEXT NOT NULL,
          depth INTEGER,
          host TEXT,
          reason TEXT,
          queue_size INTEGER,
          alias TEXT,
          queue_origin TEXT,
          queue_role TEXT,
          queue_depth_bucket TEXT,
          priority_score REAL,
          priority_source TEXT,
          bonus_applied REAL,
          cluster_id TEXT,
          gap_prediction_score REAL,
          created_at TEXT DEFAULT (datetime('now'))
        , url_id INTEGER);

CREATE table IF NOT EXISTS schema_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    details JSON
  );

CREATE table IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      description TEXT,
      rollback_sql TEXT
    );

CREATE table IF NOT EXISTS topic_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      source TEXT,
      metadata JSON
    );

CREATE table IF NOT EXISTS "url_aliases" (
  id INTEGER PRIMARY KEY,
  classification TEXT,
  reason TEXT,
  "exists" INTEGER,
  checked_at TEXT NOT NULL,
  metadata TEXT,
  url_exists INTEGER DEFAULT 0,
  url_id INTEGER,
  alias_url_id INTEGER
);

CREATE table IF NOT EXISTS url_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

CREATE table IF NOT EXISTS url_category_map (
        url_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (url_id, category_id),
        FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES url_categories(id) ON DELETE CASCADE
      );

CREATE table IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        canonical_url TEXT,
        created_at TEXT,
        last_seen_at TEXT,
        analysis TEXT
      , host TEXT);

CREATE index IF NOT EXISTS idx_analysis_run_events_run_ts ON analysis_run_events(run_id, ts DESC);

CREATE index IF NOT EXISTS idx_analysis_runs_background_task ON analysis_runs(background_task_id);

CREATE index IF NOT EXISTS idx_analysis_runs_started_at ON analysis_runs(started_at DESC);

CREATE index IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status, started_at DESC);

CREATE index IF NOT EXISTS idx_article_place_relations_article ON article_place_relations(article_id);

CREATE index IF NOT EXISTS idx_article_place_relations_confidence ON article_place_relations(confidence DESC);

CREATE index IF NOT EXISTS idx_article_place_relations_place ON article_place_relations(place_id);

CREATE index IF NOT EXISTS idx_article_places_place ON article_places(place);

CREATE index IF NOT EXISTS idx_article_places_url_id ON article_places(article_url_id);

CREATE index IF NOT EXISTS idx_article_xpath_patterns_domain ON article_xpath_patterns(domain);

CREATE UNIQUE INDEX idx_article_xpath_patterns_domain_xpath ON article_xpath_patterns(domain, xpath);

CREATE index IF NOT EXISTS idx_background_tasks_created ON background_tasks(created_at DESC);

CREATE index IF NOT EXISTS idx_background_tasks_status ON background_tasks(status);

CREATE index IF NOT EXISTS idx_background_tasks_type ON background_tasks(task_type);

CREATE index IF NOT EXISTS idx_bucket_entries_bucket ON bucket_entries(bucket_id);

CREATE index IF NOT EXISTS idx_bucket_entries_key ON bucket_entries(entry_key);

CREATE index IF NOT EXISTS idx_compression_buckets_domain 
      ON compression_buckets(domain_pattern);

CREATE index IF NOT EXISTS idx_compression_buckets_finalized 
      ON compression_buckets(finalized_at);

CREATE index IF NOT EXISTS idx_compression_buckets_status ON compression_buckets(status);

CREATE index IF NOT EXISTS idx_compression_buckets_type 
      ON compression_buckets(bucket_type);

CREATE index IF NOT EXISTS idx_compression_buckets_type_status ON compression_buckets(bucket_type, status);

CREATE index IF NOT EXISTS idx_content_analysis_classification ON content_analysis(classification);

CREATE index IF NOT EXISTS idx_content_analysis_content ON content_analysis(content_id);

CREATE index IF NOT EXISTS idx_content_analysis_content_classification ON content_analysis(content_id, classification);

CREATE index IF NOT EXISTS idx_content_analysis_content_id ON content_analysis(content_id);

CREATE index IF NOT EXISTS idx_content_analysis_pending_json ON content_analysis(id) WHERE analysis_json IS NULL;

CREATE index IF NOT EXISTS idx_content_analysis_pending_version_null ON content_analysis(id) WHERE analysis_json IS NOT NULL AND analysis_version IS NULL;

CREATE index IF NOT EXISTS idx_content_analysis_version ON content_analysis(analysis_version);

CREATE index IF NOT EXISTS idx_content_storage_bucket 
      ON content_storage(compression_bucket_id);

CREATE index IF NOT EXISTS idx_content_storage_category ON content_storage(content_category, content_subtype);

CREATE index IF NOT EXISTS idx_content_storage_http_response ON content_storage(http_response_id);

CREATE index IF NOT EXISTS idx_content_storage_sha256 
      ON content_storage(content_sha256);

CREATE index IF NOT EXISTS idx_content_storage_type 
      ON content_storage(storage_type);

CREATE index IF NOT EXISTS idx_coverage_gaps_job_status ON coverage_gaps(job_id, resolution_status);

CREATE index IF NOT EXISTS idx_coverage_gaps_priority ON coverage_gaps(priority_score DESC);

CREATE index IF NOT EXISTS idx_coverage_gaps_type ON coverage_gaps(gap_type);

CREATE index IF NOT EXISTS idx_coverage_snapshots_coverage ON coverage_snapshots(coverage_percentage DESC);

CREATE index IF NOT EXISTS idx_coverage_snapshots_domain ON coverage_snapshots(domain);

CREATE index IF NOT EXISTS idx_coverage_snapshots_job_time ON coverage_snapshots(job_id, snapshot_time DESC);

CREATE index IF NOT EXISTS idx_crawl_jobs_end_started_desc ON crawl_jobs(ended_at, started_at DESC);

CREATE index IF NOT EXISTS idx_crawl_jobs_sort_key ON crawl_jobs((COALESCE(ended_at, started_at)) DESC);

CREATE index IF NOT EXISTS idx_crawl_jobs_started_desc ON crawl_jobs(started_at DESC);

CREATE index IF NOT EXISTS idx_crawl_jobs_status_active ON crawl_jobs(status, ended_at, started_at DESC);

CREATE index IF NOT EXISTS idx_crawl_jobs_timeline ON crawl_jobs(ended_at DESC, started_at DESC);

CREATE index IF NOT EXISTS idx_crawl_jobs_url_id_temp ON crawl_jobs(url_id);

CREATE index IF NOT EXISTS idx_crawl_milestones_job ON crawl_milestones(job_id);

CREATE index IF NOT EXISTS idx_crawl_milestones_job_ts ON crawl_milestones(job_id, ts DESC);

CREATE index IF NOT EXISTS idx_crawl_milestones_kind ON crawl_milestones(kind);

CREATE index IF NOT EXISTS idx_crawl_milestones_scope_kind ON crawl_milestones(scope, kind);

CREATE index IF NOT EXISTS idx_crawl_problems_job ON crawl_problems(job_id);

CREATE index IF NOT EXISTS idx_crawl_problems_job_ts ON crawl_problems(job_id, ts DESC);

CREATE index IF NOT EXISTS idx_crawl_problems_kind ON crawl_problems(kind);

CREATE index IF NOT EXISTS idx_crawl_skip_terms_reason ON crawl_skip_terms(reason);

CREATE index IF NOT EXISTS idx_crawl_state_stage ON gazetteer_crawl_state(stage);

CREATE index IF NOT EXISTS idx_crawl_state_status ON gazetteer_crawl_state(status);

CREATE index IF NOT EXISTS idx_crawl_tasks_job_status ON crawl_tasks(job_id, status, created_at DESC);

CREATE index IF NOT EXISTS idx_crawl_tasks_status ON crawl_tasks(status, created_at DESC);

CREATE index IF NOT EXISTS idx_cross_crawl_confidence ON cross_crawl_knowledge(confidence_level DESC);

CREATE index IF NOT EXISTS idx_cross_crawl_domain_type ON cross_crawl_knowledge(source_domain, knowledge_type);

CREATE index IF NOT EXISTS idx_cross_crawl_usage ON cross_crawl_knowledge(usage_count DESC);

CREATE index IF NOT EXISTS idx_dashboard_metrics_job_name_time ON dashboard_metrics(job_id, metric_name, timestamp DESC);

CREATE index IF NOT EXISTS idx_discovery_events_url ON discovery_events(url_id);

CREATE index IF NOT EXISTS idx_discovery_events_url_discovered ON discovery_events(url_id, discovered_at DESC);

CREATE index IF NOT EXISTS idx_discovery_job ON discovery_events(crawl_job_id);

CREATE index IF NOT EXISTS idx_discovery_url ON discovery_events(url_id, discovered_at DESC);

CREATE index IF NOT EXISTS idx_domains_host ON domains(host);

CREATE index IF NOT EXISTS idx_domains_last_seen ON domains(last_seen_at);

CREATE index IF NOT EXISTS idx_errors_code ON errors(code);

CREATE index IF NOT EXISTS idx_errors_host ON errors(host);

CREATE index IF NOT EXISTS idx_errors_kind ON errors(kind);

CREATE index IF NOT EXISTS idx_errors_time ON errors(at);

CREATE index IF NOT EXISTS idx_errors_url_id_temp ON errors(url_id);

CREATE index IF NOT EXISTS idx_fetches_host ON fetches(host);

CREATE index IF NOT EXISTS idx_fetches_url ON fetches(url_id);

CREATE index IF NOT EXISTS idx_gap_predictions_job_confidence ON gap_predictions(job_id, confidence_score DESC);

CREATE index IF NOT EXISTS idx_gap_predictions_status ON gap_predictions(validation_status);

CREATE index IF NOT EXISTS idx_http_responses_cache_expires_at ON http_responses(cache_expires_at);

CREATE index IF NOT EXISTS idx_http_responses_cache_key_category ON http_responses(cache_key, cache_category);

CREATE index IF NOT EXISTS idx_http_responses_fetched ON http_responses(fetched_at);

CREATE index IF NOT EXISTS idx_http_responses_status ON http_responses(http_status);

CREATE index IF NOT EXISTS idx_http_responses_url ON http_responses(url_id, fetched_at DESC);

CREATE index IF NOT EXISTS idx_http_responses_url_fetched ON http_responses(url_id, fetched_at);

CREATE index IF NOT EXISTS idx_http_responses_url_status ON http_responses(url_id, http_status);

CREATE index IF NOT EXISTS idx_hub_discoveries_confidence ON hub_discoveries(confidence_score DESC);

CREATE index IF NOT EXISTS idx_hub_discoveries_job_discovered ON hub_discoveries(job_id, discovered_at DESC);

CREATE index IF NOT EXISTS idx_hub_discoveries_method ON hub_discoveries(discovery_method);

CREATE index IF NOT EXISTS idx_hub_validations_domain_status ON hub_validations(domain, validation_status);

CREATE index IF NOT EXISTS idx_hub_validations_expires ON hub_validations(expires_at);

CREATE index IF NOT EXISTS idx_hub_validations_priority ON hub_validations(revalidation_priority DESC);

CREATE index IF NOT EXISTS idx_ingestion_runs_completed ON ingestion_runs(completed_at);

CREATE index IF NOT EXISTS idx_ingestion_runs_source_status ON ingestion_runs(source, status);

CREATE index IF NOT EXISTS idx_knowledge_reuse_job ON knowledge_reuse_events(job_id);

CREATE index IF NOT EXISTS idx_knowledge_reuse_type_success ON knowledge_reuse_events(reuse_type, success_outcome);

CREATE index IF NOT EXISTS idx_latest_fetch_classification ON latest_fetch(classification);

CREATE index IF NOT EXISTS idx_latest_fetch_status ON latest_fetch(http_status);

CREATE index IF NOT EXISTS idx_links_dst ON links(dst_url_id);

CREATE index IF NOT EXISTS idx_links_dst_url_id_temp ON links(dst_url_id);

CREATE index IF NOT EXISTS idx_links_src ON links(src_url_id);

CREATE index IF NOT EXISTS idx_links_src_url_id_temp ON links(src_url_id);

CREATE index IF NOT EXISTS idx_milestone_achievements_job_achieved ON milestone_achievements(job_id, achieved_at DESC);

CREATE index IF NOT EXISTS idx_milestone_achievements_type ON milestone_achievements(milestone_type);

CREATE index IF NOT EXISTS idx_news_websites_enabled ON news_websites(enabled);

CREATE index IF NOT EXISTS idx_news_websites_parent ON news_websites(parent_domain);

CREATE index IF NOT EXISTS idx_news_websites_stats_updated 
        ON news_websites_stats_cache(last_updated_at);

CREATE index IF NOT EXISTS idx_news_websites_type ON news_websites(website_type);

CREATE index IF NOT EXISTS idx_non_geo_topic_slug ON non_geo_topic_slugs(slug);

CREATE index IF NOT EXISTS idx_place_attr_attr ON place_attribute_values(attr);

CREATE index IF NOT EXISTS idx_place_attr_source ON place_attribute_values(source);

CREATE index IF NOT EXISTS idx_place_attributes_kind ON place_attributes(attribute_kind);

CREATE index IF NOT EXISTS idx_place_attributes_place ON place_attributes(place_id);

CREATE index IF NOT EXISTS idx_place_attributes_place_attr ON place_attributes(place_id, attribute_kind);

CREATE index IF NOT EXISTS idx_place_attributes_source ON place_attributes(source);

CREATE index IF NOT EXISTS idx_place_external_place ON place_external_ids(place_id);

CREATE index IF NOT EXISTS idx_place_hierarchy_child ON place_hierarchy(child_id);

CREATE index IF NOT EXISTS idx_place_hierarchy_parent ON place_hierarchy(parent_id);

CREATE index IF NOT EXISTS idx_place_hierarchy_relation ON place_hierarchy(relation);

CREATE index IF NOT EXISTS idx_place_hub_audit_attempt ON place_hub_audit(attempt_id);

CREATE index IF NOT EXISTS idx_place_hub_audit_decision ON place_hub_audit(decision);

CREATE index IF NOT EXISTS idx_place_hub_audit_domain ON place_hub_audit(domain);

CREATE index IF NOT EXISTS idx_place_hub_audit_run ON place_hub_audit(run_id);

CREATE index IF NOT EXISTS idx_place_hub_candidates_attempt ON place_hub_candidates(attempt_id);

CREATE index IF NOT EXISTS idx_place_hub_candidates_candidate_url ON place_hub_candidates(candidate_url_id);

CREATE index IF NOT EXISTS idx_place_hub_candidates_domain ON place_hub_candidates(domain);

CREATE index IF NOT EXISTS idx_place_hub_candidates_domain_status ON place_hub_candidates(domain, status);

CREATE index IF NOT EXISTS idx_place_hub_candidates_normalized_url ON place_hub_candidates(normalized_url_id);

CREATE index IF NOT EXISTS idx_place_hub_candidates_place_kind ON place_hub_candidates(place_kind);

CREATE index IF NOT EXISTS idx_place_hub_determinations_domain
        ON place_hub_determinations(domain, created_at DESC);

CREATE index IF NOT EXISTS idx_place_hub_guess_runs_background_task_id
    ON place_hub_guess_runs(background_task_id);

CREATE index IF NOT EXISTS idx_place_hub_guess_runs_started_at
    ON place_hub_guess_runs(started_at);

CREATE index IF NOT EXISTS idx_place_hub_guess_runs_status
    ON place_hub_guess_runs(status);

CREATE index IF NOT EXISTS idx_place_hub_unknown_terms_canonical_url ON place_hub_unknown_terms(canonical_url_id);

CREATE index IF NOT EXISTS idx_place_hub_unknown_terms_url ON place_hub_unknown_terms(url_id);

CREATE index IF NOT EXISTS idx_place_hubs_host ON place_hubs(host);

CREATE index IF NOT EXISTS idx_place_hubs_place ON place_hubs(place_slug);

CREATE index IF NOT EXISTS idx_place_hubs_topic ON place_hubs(topic_slug);

CREATE index IF NOT EXISTS idx_place_hubs_url ON place_hubs(url_id);

CREATE index IF NOT EXISTS idx_place_names_lang ON place_names(lang);

CREATE index IF NOT EXISTS idx_place_names_name ON place_names(name);

CREATE index IF NOT EXISTS idx_place_names_norm ON place_names(normalized);

CREATE index IF NOT EXISTS idx_place_names_place ON place_names(place_id);

CREATE index IF NOT EXISTS idx_place_page_mappings_host_kind ON place_page_mappings(host, page_kind);

CREATE index IF NOT EXISTS idx_place_page_mappings_host_status ON place_page_mappings(host, status, page_kind);

CREATE index IF NOT EXISTS idx_place_page_mappings_place ON place_page_mappings(place_id);

CREATE index IF NOT EXISTS idx_place_page_mappings_status ON place_page_mappings(status);

CREATE index IF NOT EXISTS idx_place_provenance_external ON place_provenance(external_id);

CREATE index IF NOT EXISTS idx_place_provenance_place ON place_provenance(place_id);

CREATE index IF NOT EXISTS idx_place_provenance_place_source ON place_provenance(place_id, source);

CREATE index IF NOT EXISTS idx_place_provenance_source ON place_provenance(source);

CREATE index IF NOT EXISTS idx_places_adm1 ON places(adm1_code);

CREATE index IF NOT EXISTS idx_places_adm2 ON places(adm2_code);

CREATE index IF NOT EXISTS idx_places_canonical_name ON places(canonical_name_id);

CREATE index IF NOT EXISTS idx_places_country ON places(country_code);

CREATE index IF NOT EXISTS idx_places_crawl_depth ON places(crawl_depth);

CREATE index IF NOT EXISTS idx_places_kind ON places(kind);

CREATE index IF NOT EXISTS idx_places_kind_country ON places(kind, country_code);

CREATE index IF NOT EXISTS idx_places_osm ON places(osm_type, osm_id);

CREATE index IF NOT EXISTS idx_places_population ON places(population);

CREATE index IF NOT EXISTS idx_places_priority_score ON places(priority_score);

CREATE index IF NOT EXISTS idx_places_status ON places(status);

CREATE index IF NOT EXISTS idx_places_wikidata_qid ON places(wikidata_qid);

CREATE index IF NOT EXISTS idx_planner_patterns_confidence ON planner_patterns(confidence_score DESC);

CREATE index IF NOT EXISTS idx_planner_patterns_domain_type ON planner_patterns(domain, pattern_type);

CREATE index IF NOT EXISTS idx_planner_patterns_updated ON planner_patterns(updated_at DESC);

CREATE index IF NOT EXISTS idx_planner_stage_events_job ON planner_stage_events(job_id);

CREATE index IF NOT EXISTS idx_planner_stage_events_job_ts ON planner_stage_events(job_id, ts DESC);

CREATE index IF NOT EXISTS idx_planner_stage_job_ts ON planner_stage_events(job_id, ts DESC);

CREATE index IF NOT EXISTS idx_planner_stage_stage ON planner_stage_events(stage, status);

CREATE index IF NOT EXISTS idx_priority_config_changes_ts ON priority_config_changes(changed_at DESC);

CREATE index IF NOT EXISTS idx_problem_clusters_boost ON problem_clusters(priority_boost DESC);

CREATE index IF NOT EXISTS idx_problem_clusters_job_kind ON problem_clusters(job_id, kind);

CREATE index IF NOT EXISTS idx_problem_clusters_status ON problem_clusters(status);

CREATE index IF NOT EXISTS idx_query_telemetry_complexity ON query_telemetry(query_complexity);

CREATE index IF NOT EXISTS idx_query_telemetry_created ON query_telemetry(created_at);

CREATE index IF NOT EXISTS idx_query_telemetry_duration ON query_telemetry(duration_ms);

CREATE index IF NOT EXISTS idx_query_telemetry_host ON query_telemetry(host);

CREATE index IF NOT EXISTS idx_query_telemetry_operation ON query_telemetry(operation);

CREATE index IF NOT EXISTS idx_query_telemetry_timestamp ON query_telemetry(timestamp DESC);

CREATE index IF NOT EXISTS idx_query_telemetry_type ON query_telemetry(query_type);

CREATE index IF NOT EXISTS idx_queue_events_action ON queue_events(action);

CREATE index IF NOT EXISTS idx_queue_events_enhanced_cluster ON queue_events_enhanced(cluster_id);

CREATE index IF NOT EXISTS idx_queue_events_enhanced_host ON queue_events_enhanced(host);

CREATE index IF NOT EXISTS idx_queue_events_enhanced_job_ts ON queue_events_enhanced(job_id, ts DESC);

CREATE index IF NOT EXISTS idx_queue_events_enhanced_priority ON queue_events_enhanced(priority_score DESC);

CREATE index IF NOT EXISTS idx_queue_events_host ON queue_events(host);

CREATE index IF NOT EXISTS idx_queue_events_job ON queue_events(job_id);

CREATE index IF NOT EXISTS idx_queue_events_job_action_id_desc ON queue_events(job_id, action, id DESC);

CREATE index IF NOT EXISTS idx_queue_events_job_id_desc ON queue_events(job_id, id DESC);

CREATE index IF NOT EXISTS idx_queue_events_job_ts ON queue_events(job_id, ts DESC);

CREATE index IF NOT EXISTS idx_queue_events_url_id_temp ON queue_events(url_id);

CREATE index IF NOT EXISTS idx_topic_keywords_lang ON topic_keywords(lang);

CREATE index IF NOT EXISTS idx_unknown_terms_host ON place_hub_unknown_terms(host);

CREATE index IF NOT EXISTS idx_unknown_terms_slug ON place_hub_unknown_terms(term_slug);

CREATE index IF NOT EXISTS idx_urls_canonical ON urls(canonical_url);

CREATE index IF NOT EXISTS idx_urls_host ON urls(host);

CREATE index IF NOT EXISTS idx_urls_url ON urls(url);

CREATE UNIQUE INDEX uniq_country_places ON places(country_code) WHERE kind='country' AND country_code IS NOT NULL;

CREATE UNIQUE INDEX uniq_crawl_skip_terms ON crawl_skip_terms(lang, normalized);

CREATE UNIQUE INDEX uniq_place_names ON place_names(place_id, normalized, lang, name_kind);

CREATE UNIQUE INDEX uniq_place_sources ON place_sources(name, version, url, license);

CREATE UNIQUE INDEX uniq_region_places ON places(country_code, adm1_code) WHERE kind='region' AND country_code IS NOT NULL AND adm1_code IS NOT NULL;

CREATE UNIQUE INDEX uniq_topic_keywords ON topic_keywords(topic, lang, normalized);

CREATE UNIQUE INDEX uniq_url_alias ON url_aliases(url_id, alias_url_id);

CREATE trigger IF NOT EXISTS trg_place_hierarchy_no_cycle_ins
      BEFORE INSERT ON place_hierarchy
      WHEN EXISTS (
        WITH RECURSIVE reach(parent, child) AS (
          SELECT parent_id, child_id FROM place_hierarchy
          UNION ALL
          SELECT ph.parent_id, reach.child FROM place_hierarchy ph JOIN reach ON ph.child_id = reach.parent
        )
        SELECT 1 FROM reach WHERE parent = NEW.child_id AND child = NEW.parent_id
      )
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy insertion would create a cycle'); END;

CREATE trigger IF NOT EXISTS trg_place_hierarchy_no_cycle_upd
      BEFORE UPDATE ON place_hierarchy
      WHEN EXISTS (
        WITH RECURSIVE reach(parent, child) AS (
          SELECT parent_id, child_id FROM place_hierarchy
          UNION ALL
          SELECT ph.parent_id, reach.child FROM place_hierarchy ph JOIN reach ON ph.child_id = reach.parent
        )
        SELECT 1 FROM reach WHERE parent = NEW.child_id AND child = NEW.parent_id
      )
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy update would create a cycle'); END;

CREATE trigger IF NOT EXISTS trg_place_hierarchy_no_self_ins
      BEFORE INSERT ON place_hierarchy
      WHEN NEW.parent_id = NEW.child_id
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy parent_id equals child_id'); END;

CREATE trigger IF NOT EXISTS trg_place_hierarchy_no_self_upd
      BEFORE UPDATE ON place_hierarchy
      WHEN NEW.parent_id = NEW.child_id
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy parent_id equals child_id'); END;

CREATE trigger IF NOT EXISTS trg_place_names_delete_clear_canonical
      AFTER DELETE ON place_names
      BEGIN
        UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id = OLD.id;
      END;

CREATE trigger IF NOT EXISTS trg_place_names_nonempty_ins
      BEFORE INSERT ON place_names
      WHEN TRIM(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END;

CREATE trigger IF NOT EXISTS trg_place_names_nonempty_upd
      BEFORE UPDATE ON place_names
      WHEN TRIM(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END;

CREATE trigger IF NOT EXISTS trg_places_canon_ins
      AFTER INSERT ON places
      WHEN NEW.canonical_name_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = NEW.canonical_name_id AND pn.place_id = NEW.id
      )
      BEGIN SELECT RAISE(ABORT, 'places.canonical_name_id must reference a name belonging to this place'); END;

CREATE trigger IF NOT EXISTS trg_places_canon_upd
      AFTER UPDATE ON places
      WHEN NEW.canonical_name_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = NEW.canonical_name_id AND pn.place_id = NEW.id
      )
      BEGIN SELECT RAISE(ABORT, 'places.canonical_name_id must reference a name belonging to this place'); END;

CREATE trigger IF NOT EXISTS trg_places_country_require_ins
      BEFORE INSERT ON places
      WHEN NEW.kind='country' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR LENGTH(TRIM(NEW.country_code)) <> 2)
      BEGIN SELECT RAISE(ABORT, 'current country rows require 2-letter country_code'); END;

CREATE trigger IF NOT EXISTS trg_places_country_require_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind='country' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR LENGTH(TRIM(NEW.country_code)) <> 2)
      BEGIN SELECT RAISE(ABORT, 'current country rows require 2-letter country_code'); END;

CREATE trigger IF NOT EXISTS trg_places_country_upper_ins
      BEFORE INSERT ON places
      WHEN NEW.country_code IS NOT NULL AND NEW.country_code <> UPPER(NEW.country_code)
      BEGIN SELECT RAISE(ABORT, 'places.country_code must be uppercase'); END;

CREATE trigger IF NOT EXISTS trg_places_country_upper_upd
      BEFORE UPDATE ON places
      WHEN NEW.country_code IS NOT NULL AND NEW.country_code <> UPPER(NEW.country_code)
      BEGIN SELECT RAISE(ABORT, 'places.country_code must be uppercase'); END;

CREATE trigger IF NOT EXISTS trg_places_kind_check_ins
      BEFORE INSERT ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational', 'planet')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;

CREATE trigger IF NOT EXISTS trg_places_kind_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational', 'planet')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;

CREATE trigger IF NOT EXISTS trg_places_latlng_check_ins
      BEFORE INSERT ON places
      WHEN NEW.lat IS NOT NULL AND (NEW.lat < -90 OR NEW.lat > 90)
      BEGIN SELECT RAISE(ABORT, 'places.lat out of range'); END;

CREATE trigger IF NOT EXISTS trg_places_latlng_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.lat IS NOT NULL AND (NEW.lat < -90 OR NEW.lat > 90)
      BEGIN SELECT RAISE(ABORT, 'places.lat out of range'); END;

CREATE trigger IF NOT EXISTS trg_places_lng_check_ins
      BEFORE INSERT ON places
      WHEN NEW.lng IS NOT NULL AND (NEW.lng < -180 OR NEW.lng > 180)
      BEGIN SELECT RAISE(ABORT, 'places.lng out of range'); END;

CREATE trigger IF NOT EXISTS trg_places_lng_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.lng IS NOT NULL AND (NEW.lng < -180 OR NEW.lng > 180)
      BEGIN SELECT RAISE(ABORT, 'places.lng out of range'); END;

CREATE trigger IF NOT EXISTS trg_places_population_check_ins
      BEFORE INSERT ON places
      WHEN NEW.population IS NOT NULL AND NEW.population < 0
      BEGIN SELECT RAISE(ABORT, 'places.population must be >= 0'); END;

CREATE trigger IF NOT EXISTS trg_places_population_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.population IS NOT NULL AND NEW.population < 0
      BEGIN SELECT RAISE(ABORT, 'places.population must be >= 0'); END;

CREATE trigger IF NOT EXISTS trg_places_region_require_ins
      BEFORE INSERT ON places
      WHEN NEW.kind='region' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' OR NEW.adm1_code IS NULL OR TRIM(NEW.adm1_code) = '')
      BEGIN SELECT RAISE(ABORT, 'current region rows require country_code and adm1_code'); END;

CREATE trigger IF NOT EXISTS trg_places_region_require_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind='region' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' OR NEW.adm1_code IS NULL OR TRIM(NEW.adm1_code) = '')
      BEGIN SELECT RAISE(ABORT, 'current region rows require country_code and adm1_code'); END;

CREATE trigger IF NOT EXISTS trg_places_status_check_ins
      BEFORE INSERT ON places
      WHEN NEW.status IS NOT NULL AND NEW.status NOT IN ('current','historical')
      BEGIN SELECT RAISE(ABORT, 'places.status invalid'); END;

CREATE trigger IF NOT EXISTS trg_places_status_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.status IS NOT NULL AND NEW.status NOT IN ('current','historical')
      BEGIN SELECT RAISE(ABORT, 'places.status invalid'); END;

CREATE trigger IF NOT EXISTS trg_latest_fetch_upsert
  AFTER INSERT ON fetches
  WHEN NEW.url_id IS NOT NULL
  BEGIN
    INSERT INTO latest_fetch(url, ts, http_status, classification, word_count)
    SELECT u.url,
           COALESCE(NEW.fetched_at, NEW.request_started_at),
           NEW.http_status,
           NEW.classification,
           NEW.word_count
    FROM urls u
    WHERE u.id = NEW.url_id
    ON CONFLICT(url) DO UPDATE SET
      ts = CASE WHEN excluded.ts > COALESCE(latest_fetch.ts, '') THEN excluded.ts ELSE latest_fetch.ts END,
      http_status = CASE WHEN excluded.ts >= COALESCE(latest_fetch.ts, '') THEN excluded.http_status ELSE latest_fetch.http_status END,
      classification = CASE WHEN excluded.ts >= COALESCE(latest_fetch.ts, '') THEN excluded.classification ELSE latest_fetch.classification END,
      word_count = CASE WHEN excluded.ts >= COALESCE(latest_fetch.ts, '') THEN excluded.word_count ELSE latest_fetch.word_count END;
  END;

CREATE trigger IF NOT EXISTS trg_urls_from_fetches_insert
  AFTER INSERT ON fetches
  WHEN NEW.url_id IS NOT NULL
  BEGIN
    UPDATE urls
    SET
      created_at = COALESCE(created_at, COALESCE(NEW.request_started_at, NEW.fetched_at, datetime('now'))),
      last_seen_at = COALESCE(NEW.fetched_at, datetime('now'))
    WHERE id = NEW.url_id;
  END;