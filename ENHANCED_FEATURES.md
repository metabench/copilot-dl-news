# Enhanced Crawler Features

This document describes the comprehensive enhanced crawler features implemented for intelligent crawling with configurable priority systems, modular database architecture, and robust operation capabilities.

## Overview

The enhanced crawler features provide:

1. **Configurable Priority System** - JSON-based configuration with runtime updates
2. **Modular Database Architecture** - Dedicated database classes for different concerns
3. **Gap-Driven Prioritization** - Intelligent queue management based on coverage gaps
4. **Problem Clustering** - Advanced analysis of crawl issues for predictive improvements
5. **Planner Knowledge Reuse** - Pattern learning and hub validation across crawls
6. **Coverage Analytics** - Real-time monitoring and dashboard for crawl performance
7. **Runtime Configuration Management** - Live updates without crawler restart

## Quick Start

### Basic Usage

1. **Start the UI Server**:
   ```bash
   node src/ui/express/server.js
   ```

2. **Access Enhanced Dashboards**:
   - Coverage Analytics: http://localhost:41000/coverage-dashboard.html
   - Priority Configuration: http://localhost:41000/priority-config.html

3. **Run Enhanced Crawl**:
   Use the "intelligent" crawl type in the UI or via API:
   ```json
   {
     "startUrl": "https://example.com",
     "crawlType": "intelligent",
     "maxPages": 1000
   }
   ```

### Configuration

Enhanced features are configured via `config/priority-config.json`:

```json
{
  "queuePriorityBonuses": {
    "adaptive-seed": 20,
    "gap-prediction": 15,
    "sitemap": 10,
    "hub-validated": 12,
    "pattern-learned": 8
  },
  "priorityWeights": {
    "base": 1.0,
    "discovery-method": 1.2,
    "gap-score": 1.5,
    "problem-clusters": 1.3
  },
  "features": {
    "gap-driven-prioritization": true,
    "problem-clustering": true,
    "planner-knowledge-reuse": true,
    "coverage-analytics": true,
    "priority-debugging": false
  },
  "clustering": {
    "similarityThreshold": 0.7,
    "minClusterSize": 3,
    "maxGapPredictions": 10,
    "patternConfidence": 0.8
  }
}
```

## Architecture Components

### 1. Configuration Management

**File**: `src/config/ConfigManager.js`

Centralized configuration management with:
- JSON file-based configuration
- Runtime updates with validation
- File watching for live reloads
- Change notifications

**Key Methods**:
- `getConfig()` - Get current configuration
- `updateConfig(updates)` - Update configuration sections
- `resetToDefaults()` - Reset to default values
- `validateConfig(config)` - Validate configuration structure

### 2. Priority Scoring System

**File**: `src/crawler/PriorityScorer.js`

Enhanced priority calculation with configurable bonuses and weights:

**Priority Formula**:
```
Priority = BasePriority + DiscoveryMethodBonus + 
          (DiscoveryMethodWeight × BasePriority) +
          (GapScoreWeight × GapScore) +
          (ProblemClusterWeight × ClusterBoost)
```

**Discovery Method Bonuses**:
- `adaptive-seed`: URLs from intelligent seeding (default: 20)
- `gap-prediction`: URLs predicted to fill gaps (default: 15)
- `sitemap`: URLs from XML sitemaps (default: 10)
- `hub-validated`: Validated hub pages (default: 12)
- `pattern-learned`: URLs matching learned patterns (default: 8)

### 3. Modular Database Architecture

**Enhanced Database Adapter**: `src/db/EnhancedDatabaseAdapter.js`

Transparent integration layer that combines:

- **QueueDatabase** (`src/db/QueueDatabase.js`): Queue management, problem clustering, gap predictions
- **PlannerDatabase** (`src/db/PlannerDatabase.js`): Pattern learning, hub validation, knowledge reuse
- **CoverageDatabase** (`src/db/CoverageDatabase.js`): Real-time coverage tracking, milestone analytics

**Key Features**:
- Backward compatibility with existing NewsDatabase
- Graceful degradation on initialization failures
- Event-driven architecture for real-time updates

### 4. Problem Clustering Service

**File**: `src/crawler/ProblemClusteringService.js`

Intelligent analysis of crawl problems to predict coverage gaps:

**Clustering Algorithm**:
1. Group similar problems by kind, scope, and target patterns
2. Calculate similarity scores using string matching and pattern analysis
3. Generate gap predictions based on cluster patterns
4. Calculate priority boosts for related URLs

**Gap Prediction Methods**:
- Pattern-based URL generation
- Host/path analysis for missing sections
- Country/topic hub prediction
- Archive/history path discovery

### 5. Planner Knowledge Service

**File**: `src/crawler/PlannerKnowledgeService.js`

Cross-crawl knowledge persistence and reuse:

**Pattern Learning**:
- Extract URL patterns from successful discoveries
- Store patterns with confidence scores
- Validate patterns across multiple crawls
- Generate candidate URLs from learned patterns

**Hub Validation**:
- Cache hub validation results
- Track confidence scores over time
- Expire stale validations
- Reuse validated hubs across crawls

### 6. Coverage Analytics

**Database**: `src/db/CoverageDatabase.js`
**API Routes**: `src/ui/express/routes/coverage.js`
**Dashboard**: `src/ui/express/public/coverage-dashboard.html`

Real-time coverage monitoring with:

**Metrics Tracked**:
- Coverage snapshots (percentage, hubs discovered/expected, gaps)
- Hub discoveries with confidence scores and methods
- Active coverage gaps with priority scores
- Milestone achievements
- Queue analytics with priority distribution
- Knowledge reuse statistics

**API Endpoints**:
- `GET /api/coverage/jobs/:jobId/snapshot` - Current coverage snapshot
- `GET /api/coverage/jobs/:jobId/trend` - Coverage trend over time
- `GET /api/coverage/jobs/:jobId/discoveries` - Recent hub discoveries
- `GET /api/coverage/jobs/:jobId/gaps` - Active coverage gaps
- `GET /api/coverage/jobs/:jobId/milestones` - Milestone achievements
- `GET /api/coverage/jobs/:jobId/metrics` - Real-time metrics
- `GET /api/coverage/jobs/:jobId/queue-analytics` - Queue priority analysis
- `GET /api/coverage/jobs/:jobId/knowledge-stats` - Knowledge reuse stats

## Enhanced Features

### Gap-Driven Prioritization

Automatically boosts priority for URLs predicted to fill coverage gaps:

1. **Problem Analysis**: Analyzes crawl problems to identify missing content patterns
2. **Gap Prediction**: Generates candidate URLs likely to fill identified gaps  
3. **Priority Boosting**: Applies configurable priority bonuses to gap-filling URLs
4. **Continuous Learning**: Updates predictions based on crawl results

**Configuration**:
```json
{
  "features": {
    "gap-driven-prioritization": true
  },
  "priorityWeights": {
    "gap-score": 1.5
  }
}
```

### Problem Clustering

Groups related problems to identify systematic issues:

**Clustering Process**:
1. Collect problems during crawl execution
2. Calculate similarity between problems using multiple factors:
   - Problem kind (missing-hub, unknown-pattern, etc.)
   - Scope (domain/site section)
   - Target pattern analysis
   - Message content similarity
3. Form clusters when similarity exceeds threshold
4. Generate gap predictions from cluster patterns

**Benefits**:
- Reduces noise from repetitive problems
- Identifies systematic coverage gaps
- Enables predictive URL generation
- Improves crawl efficiency

### Planner Knowledge Reuse

Learns and reuses patterns across multiple crawl sessions:

**Pattern Learning**:
- Extracts successful URL patterns from discoveries
- Stores patterns with confidence scores and metadata
- Validates patterns across multiple crawls
- Generates candidate URLs from learned patterns

**Hub Validation Caching**:
- Caches hub validation results with expiration
- Reuses validated hubs to avoid redundant checks
- Tracks confidence evolution over time
- Supports cross-crawl hub discovery

**Knowledge Persistence**:
- SQLite tables for pattern and hub data
- Event tracking for knowledge reuse
- Analytics on knowledge effectiveness
- Configurable confidence thresholds

### Coverage Analytics Dashboard

Real-time monitoring dashboard with:

**Visual Components**:
- Coverage percentage with progress bars
- Real-time metrics (hubs discovered/expected, active gaps)
- Coverage trend charts using Chart.js
- Priority distribution visualization
- Recent discoveries and gaps lists
- System status indicators

**Interactive Features**:
- Job ID selection for multi-crawl environments
- Configurable update intervals
- Real-time data refresh
- Responsive design for different screen sizes

**Integration**:
- Server-Sent Events for live updates
- REST API backend for data access
- Chart.js for visualizations
- Progressive enhancement for offline operation

## Configuration Management

### Priority Configuration UI

**File**: `src/ui/express/public/priority-config.html`

Web-based configuration interface with:

**Sections**:
1. **Queue Priority Bonuses**: Configure bonuses for different URL types
2. **Priority Weights**: Set weights for priority calculation factors
3. **Feature Flags**: Enable/disable enhanced features
4. **Clustering Parameters**: Configure problem clustering behavior

**Features**:
- Real-time configuration validation
- Current value display
- Batch configuration updates
- Reset to defaults functionality
- Configuration export/import (planned)

### Runtime Configuration API

**File**: `src/ui/express/routes/config.js`

REST API for configuration management:

- `GET /api/config` - Get full configuration
- `POST /api/config` - Update configuration
- `GET /api/config/:section` - Get configuration section
- `POST /api/config/:section` - Update configuration section
- `POST /api/config/validate` - Validate configuration
- `POST /api/config/reset` - Reset to defaults

## Database Schema

### Enhanced Tables

**Queue Management**:
```sql
-- Enhanced queue events with priority metadata
CREATE TABLE enhanced_queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  url TEXT NOT NULL,
  priority_score REAL,
  priority_source TEXT, -- 'gap-prediction', 'adaptive-seed', etc.
  discovery_method TEXT,
  gap_score REAL,
  cluster_id INTEGER,
  metadata TEXT, -- JSON metadata
  created_at TEXT NOT NULL
);

-- Problem clusters for gap analysis
CREATE TABLE problem_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  cluster_signature TEXT NOT NULL,
  representative_problem TEXT, -- JSON
  problem_count INTEGER,
  similarity_score REAL,
  patterns TEXT, -- JSON array of patterns
  created_at TEXT NOT NULL
);

-- Gap predictions from cluster analysis
CREATE TABLE gap_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  cluster_id INTEGER,
  predicted_url TEXT NOT NULL,
  confidence_score REAL,
  reasoning TEXT,
  priority_boost REAL,
  validated BOOLEAN DEFAULT FALSE,
  created_at TEXT NOT NULL
);
```

**Planner Knowledge**:
```sql
-- Learned URL patterns
CREATE TABLE learned_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_signature TEXT UNIQUE NOT NULL,
  pattern_regex TEXT NOT NULL,
  confidence_score REAL,
  discovery_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  last_seen TEXT NOT NULL,
  metadata TEXT -- JSON
);

-- Hub validation cache
CREATE TABLE hub_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_url TEXT UNIQUE NOT NULL,
  is_valid BOOLEAN NOT NULL,
  confidence_score REAL,
  validation_method TEXT,
  expires_at TEXT,
  last_validated TEXT NOT NULL,
  metadata TEXT -- JSON
);

-- Knowledge reuse events
CREATE TABLE knowledge_reuse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'pattern-reused', 'hub-reused', etc.
  source_pattern_id INTEGER,
  source_hub_id INTEGER,
  target_url TEXT,
  success BOOLEAN,
  created_at TEXT NOT NULL
);
```

**Coverage Analytics**:
```sql
-- Coverage snapshots
CREATE TABLE coverage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  snapshot_time TEXT NOT NULL,
  coverage_percentage REAL,
  total_hubs_expected INTEGER,
  total_hubs_discovered INTEGER,
  gap_count INTEGER,
  metadata TEXT -- JSON with additional metrics
);

-- Hub discoveries
CREATE TABLE hub_discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  hub_url TEXT NOT NULL,
  discovery_method TEXT NOT NULL,
  confidence_score REAL,
  discovered_at TEXT NOT NULL,
  metadata TEXT
);

-- Coverage gaps
CREATE TABLE coverage_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  gap_type TEXT NOT NULL,
  gap_identifier TEXT NOT NULL,
  gap_description TEXT,
  priority_score REAL,
  attempts_count INTEGER DEFAULT 0,
  resolved BOOLEAN DEFAULT FALSE,
  first_detected TEXT NOT NULL,
  last_attempted TEXT
);

-- Milestone achievements
CREATE TABLE milestone_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  threshold_value REAL,
  actual_value REAL,
  achieved_at TEXT NOT NULL,
  metadata TEXT
);
```

## Testing

### Unit Tests

**File**: `src/__tests__/enhanced-features.test.js`

Comprehensive test coverage for:
- Configuration management and validation
- Priority scoring with different bonuses and weights
- Problem clustering and gap prediction
- Feature flag functionality
- Error handling and graceful degradation

### Integration Tests

**Planned Tests**:
- End-to-end crawl with enhanced features enabled
- Database integration and event processing
- API endpoint functionality
- Dashboard real-time updates
- Configuration persistence and reload

### Performance Tests

**Planned Tests**:
- Priority calculation performance under load
- Database query performance with enhanced tables
- Memory usage with clustering and analytics
- Configuration update response times

## Feature Flags

All enhanced features can be individually controlled:

```json
{
  "features": {
    "gap-driven-prioritization": true,    // Enable intelligent gap prediction
    "problem-clustering": true,           // Enable problem analysis and clustering
    "planner-knowledge-reuse": true,      // Enable pattern learning and reuse
    "coverage-analytics": true,           // Enable real-time coverage tracking
    "priority-debugging": false          // Enable detailed priority calculation logging
  }
}
```

**Graceful Degradation**:
- Features fail silently when disabled
- Database initialization errors don't prevent basic crawling
- Configuration errors fall back to defaults
- UI components handle missing data gracefully

## Performance Considerations

### Memory Usage

- **Configuration**: Minimal overhead (~1KB JSON)
- **Priority Scoring**: O(1) per URL with minimal memory allocation
- **Problem Clustering**: Configurable limits prevent runaway memory usage
- **Analytics**: Time-windowed data with automatic cleanup

### Database Performance

- **Indexed Tables**: All enhanced tables include appropriate indexes
- **Batch Operations**: Analytics use batch inserts for efficiency
- **Connection Pooling**: Reuses database connections where possible
- **Query Optimization**: Prepared statements and selective queries

### Network Impact

- **No Additional Requests**: Enhanced features use existing crawl data
- **Optional Analytics**: Coverage tracking can be disabled if needed
- **Efficient Serialization**: JSON configuration and minimal overhead

## Troubleshooting

### Common Issues

1. **Configuration Not Loading**:
   - Check `config/priority-config.json` exists and is valid JSON
   - Verify file permissions
   - Check server logs for configuration errors

2. **Enhanced Features Not Working**:
   - Verify feature flags are enabled in configuration
   - Check database initialization in logs
   - Ensure crawl is using "intelligent" type

3. **Dashboard Not Updating**:
   - Verify job ID is correct
   - Check Server-Sent Events connection
   - Confirm API endpoints are accessible

4. **Database Errors**:
   - Check SQLite file permissions
   - Verify disk space availability
   - Check database schema migrations in logs

### Debug Mode

Enable detailed logging:

```json
{
  "features": {
    "priority-debugging": true
  }
}
```

This provides:
- Detailed priority calculations
- Configuration change notifications
- Database operation logging
- Performance timing information

## Migration Guide

### From Basic to Enhanced Crawler

1. **Backup Database**: Always backup your SQLite database before migration
2. **Create Configuration**: Copy `config/priority-config.json.example` to `config/priority-config.json`
3. **Update Crawl Type**: Change from "basic" to "intelligent" in UI or API calls
4. **Monitor Performance**: Watch resource usage and adjust configuration as needed

### Configuration Migration

The system automatically handles:
- Missing configuration sections (uses defaults)
- Invalid configuration values (validation with fallbacks)
- Schema migrations (automatic table creation)
- Feature flag transitions (graceful enable/disable)

## API Reference

### Coverage Analytics API

All endpoints follow REST conventions with consistent response formats:

**Base Path**: `/api/coverage`

**Common Response Format**:
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "metadata": {
    "jobId": "job-123",
    "timestamp": "2023-10-01T12:00:00Z",
    "version": "1.0"
  }
}
```

**Error Response Format**:
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": { /* additional error context */ }
}
```

### Configuration API

**Base Path**: `/api/config`

**Validation Rules**:
- Priority bonuses: 0-100 (numeric)
- Priority weights: 0-10 (numeric)
- Feature flags: boolean
- Clustering parameters: validated ranges
- String values: non-empty, reasonable length

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**:
   - Neural network-based priority scoring
   - Automated pattern recognition
   - Predictive gap analysis

2. **Multi-Site Coordination**:
   - Cross-site knowledge sharing
   - Distributed crawl coordination
   - Global pattern database

3. **Advanced Analytics**:
   - Historical trend analysis
   - Performance regression detection
   - Automated optimization recommendations

4. **Enhanced UI**:
   - Real-time collaboration features
   - Advanced filtering and search
   - Custom dashboard creation
   - Mobile-responsive design improvements

### Extensibility Points

- **Custom Priority Scorers**: Plugin architecture for domain-specific scoring
- **Custom Problem Analyzers**: Pluggable problem detection and clustering
- **Custom Analytics**: Additional metrics and visualizations
- **Configuration Validators**: Domain-specific validation rules

## Contributing

### Code Style

- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add comprehensive error handling
- Include unit tests for new features

### Database Changes

- Always provide migration scripts
- Maintain backward compatibility
- Include appropriate indexes
- Document schema changes

### Configuration Changes

- Update JSON schema validation
- Provide sensible defaults
- Document configuration options
- Test configuration edge cases

## Support

For issues related to enhanced crawler features:

1. Check the troubleshooting section above
2. Review server logs for error messages
3. Verify configuration validity
4. Test with minimal configuration
5. Report issues with full context and logs