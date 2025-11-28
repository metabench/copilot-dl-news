# Content Classification System

This document describes the content classification taxonomy used throughout the system, including the emoji mapping for visual identification in the UI.

## Overview

Content classification helps identify what type of page was fetched and analyzed. Classifications are determined by the page analyzer and stored in the `content_analysis` table.

## Classification Taxonomy

### Primary Content Types

| Classification | Emoji | Description |
|---------------|-------|-------------|
| `article` | 📰 | News article, blog post, or story content |
| `nav` / `navigation` | 🧭 | Navigation or index page |
| `hub` | 🔗 | Generic hub page (links to other content) |

### Geographic Hub Types

Hub pages organized around geographic places:

| Classification | Emoji | Description | Example URL |
|---------------|-------|-------------|-------------|
| `place-hub` | 📍 | Hub for a single place | `/news/uk` |
| `place-place-hub` | 📍📍 | Hub for nested places (city within country) | `/news/uk/london` |

### Topic Hub Types

Hub pages organized around topics or categories:

| Classification | Emoji | Description | Example URL |
|---------------|-------|-------------|-------------|
| `topic-hub` | 🏷️ | Hub for a topic/category | `/sports` |
| `place-topic-hub` | 📍🏷️ | Topic hub within a place | `/uk/sports` |
| `place-place-topic-hub` | 📍📍🏷️ | Topic hub nested within places | `/uk/london/sports` |

### Special Types

| Classification | Emoji | Description |
|---------------|-------|-------------|
| `error` | ⚠️ | Error page (4xx, 5xx responses) |
| `redirect` | ↪️ | Redirect response |
| `api` / `api-response` | 🔌 | API endpoint response |
| `unknown` / `unclassified` | ❓ | Unknown or unclassified content |

### Media Types

| Classification | Emoji | Description |
|---------------|-------|-------------|
| `image` | 🖼️ | Image content |
| `video` | 🎬 | Video content |
| `audio` | 🎵 | Audio content |
| `document` | 📄 | Generic document |
| `pdf` | 📕 | PDF document |

### Listing Types

| Classification | Emoji | Description |
|---------------|-------|-------------|
| `index` | 📋 | Index page |
| `listing` | 📋 | Listing page |
| `category` | 📁 | Category page |

## Hub Detection Logic

The system uses `placeHubDetector.js` to identify geographic and topic hubs based on:

1. **URL Structure Analysis**: Segments are analyzed for place names and topic keywords
2. **Gazetteer Matching**: Place names are matched against the gazetteer database
3. **Navigation Link Count**: Pages with many navigation links (≥10) are considered hub candidates
4. **Article Screening**: Pages identified as articles are filtered out
5. **Country Hints**: Section slugs and recognized topics provide country context

### Hub Hierarchy Examples

```
/news/uk               → place-hub (📍)
                         UK news hub

/news/uk/london        → place-place-hub (📍📍)
                         London within UK

/sports                → topic-hub (🏷️)
                         Sports section hub

/uk/sports             → place-topic-hub (📍🏷️)
                         UK Sports hub

/uk/london/sports      → place-place-topic-hub (📍📍🏷️)
                         London Sports within UK
```

## API Usage

### Getting Emoji for Classification

```javascript
const { getClassificationEmoji } = require('./src/ui/utils/classificationEmoji');

getClassificationEmoji("article");        // "📰"
getClassificationEmoji("place-hub");      // "📍"
getClassificationEmoji("place-topic-hub"); // "📍🏷️"
getClassificationEmoji(null);             // "📄" (default)
```

### Getting Full Display Info

```javascript
const { getClassificationDisplay } = require('./src/ui/utils/classificationEmoji');

getClassificationDisplay("place-topic-hub");
// { emoji: "📍🏷️", label: "Place Topic Hub", classification: "place-topic-hub" }
```

## Database Schema

Classifications are stored in two related tables:

### classification_types (Lookup Table)

The normalized lookup table containing all known classification types:

```sql
CREATE TABLE classification_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,           -- e.g., 'article', 'place-hub'
  display_name TEXT NOT NULL,          -- e.g., 'Article', 'Place Hub'
  emoji TEXT,                          -- e.g., '📰', '📍'
  description TEXT,                    -- Human-readable description
  category TEXT NOT NULL,              -- 'content', 'hub', 'media', 'special', 'status'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### content_analysis (Content Data)

The main content analysis table that references classifications by name:

```sql
CREATE TABLE content_analysis (
  id INTEGER PRIMARY KEY,
  content_id INTEGER REFERENCES content_storage(id),
  analysis_version TEXT,
  classification TEXT,  -- References classification_types.name
  title TEXT,
  date TEXT,
  section TEXT,
  word_count INTEGER,
  language TEXT,
  article_xpath TEXT,
  nav_links_count INTEGER,
  article_links_count INTEGER,
  analysis_json TEXT,
  analyzed_at TEXT
);
```

### Query Examples

```sql
-- List all classifications with document counts
SELECT 
  ct.name, ct.emoji, ct.display_name, ct.category,
  COUNT(ca.id) as document_count
FROM classification_types ct
LEFT JOIN content_analysis ca ON ct.name = ca.classification
GROUP BY ct.id
ORDER BY document_count DESC;

-- Get documents for a specific classification
SELECT u.url, ca.word_count, ca.analyzed_at
FROM content_analysis ca
JOIN content_storage cs ON ca.content_id = cs.id
JOIN http_responses hr ON cs.http_response_id = hr.id
JOIN urls u ON hr.url_id = u.id
WHERE ca.classification = 'article'
ORDER BY ca.analyzed_at DESC
LIMIT 100;
```

## UI Routes

The Data Explorer provides these routes for exploring classifications:

| Route | Description |
|-------|-------------|
| `/classifications` | Lists all classification types with document counts |

## UI Display

In the Data Explorer, classification is shown:

1. **Fetch Detail Page**: Large emoji in the first meta card with the classification label
2. **URL Detail Page**: Classification shown in fetch history table
3. **Listings**: Available as a filterable/sortable column

The emoji display provides instant visual recognition of content type without reading text labels.

## Related Files

- `src/ui/utils/classificationEmoji.js` - Emoji mapping utility
- `src/tools/placeHubDetector.js` - Hub detection logic
- `src/analysis/page-analyzer.js` - Page analysis and classification
- `src/analysis/articleDetection.js` - Article detection logic
- `src/db/sqlite/v1/queries/ui/urlDetails.js` - Database queries for classification data
- `src/db/sqlite/v1/queries/ui/classificationTypes.js` - Classification types query functions
- `src/db/sqlite/v1/schema-definitions.js` - Table schema definitions
- `tools/migrations/add-classification-types.js` - Migration script for the lookup table
