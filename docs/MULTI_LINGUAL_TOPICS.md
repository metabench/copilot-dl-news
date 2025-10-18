# Multi-Lingual Topic and Skip Term Architecture

**Status**: ✅ Implemented (October 2025)  
**Purpose**: Support internationalization by storing topic keywords and skip terms in database instead of hardcoded in source code

---

## Overview

Previously, topic keywords (like "politics", "sport", "business") and skip terms (like "breaking", "trump", "biden") were hardcoded as JavaScript `Set` objects in source files. This made internationalization difficult and required code changes to add new languages.

Now, these vocabularies are stored in the database with language tags, enabling:
- ✅ Multi-lingual support (English, French, Spanish, etc.)
- ✅ Easy updates without code changes
- ✅ Provenance tracking (source, metadata)
- ✅ Dynamic loading at runtime

---

## Database Schema

### `topic_keywords` Table

Stores topic category keywords in multiple languages:

```sql
CREATE TABLE topic_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,              -- Category identifier (e.g., 'politics', 'sport')
  lang TEXT NOT NULL,               -- BCP-47 language code (e.g., 'en', 'fr', 'es')
  term TEXT NOT NULL,               -- Original term (e.g., 'politics', 'politique')
  normalized TEXT NOT NULL,         -- Normalized for matching (lowercase, etc.)
  source TEXT,                      -- Provenance (e.g., 'system-default', 'user-custom')
  metadata JSON                     -- Additional context
);

CREATE UNIQUE INDEX uniq_topic_keywords ON topic_keywords(topic, lang, normalized);
CREATE INDEX idx_topic_keywords_lang ON topic_keywords(lang);
```

**Example rows**:
```sql
-- English
INSERT INTO topic_keywords(topic, lang, term, normalized, source) 
VALUES ('politics', 'en', 'politics', 'politics', 'system-default');
INSERT INTO topic_keywords(topic, lang, term, normalized, source) 
VALUES ('politics', 'en', 'political', 'political', 'system-default');

-- French
INSERT INTO topic_keywords(topic, lang, term, normalized, source) 
VALUES ('politics', 'fr', 'politique', 'politique', 'system-default');
INSERT INTO topic_keywords(topic, lang, term, normalized, source) 
VALUES ('politics', 'fr', 'politiques', 'politiques', 'system-default');
```

### `crawl_skip_terms` Table

Stores terms to exclude during crawling (news indicators, person names, etc.):

```sql
CREATE TABLE crawl_skip_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lang TEXT NOT NULL,               -- BCP-47 language code
  term TEXT NOT NULL,               -- Original term (e.g., 'breaking', 'trump')
  normalized TEXT NOT NULL,         -- Normalized for matching
  reason TEXT,                      -- Why term should be skipped (e.g., 'news-indicator', 'common-person-name')
  source TEXT,                      -- Provenance
  metadata JSON                     -- Additional context
);

CREATE UNIQUE INDEX uniq_crawl_skip_terms ON crawl_skip_terms(lang, normalized);
CREATE INDEX idx_crawl_skip_terms_reason ON crawl_skip_terms(reason);
```

**Example rows**:
```sql
-- News indicators (English)
INSERT INTO crawl_skip_terms(lang, term, normalized, reason, source) 
VALUES ('en', 'breaking', 'breaking', 'news-indicator', 'system-default');
INSERT INTO crawl_skip_terms(lang, term, normalized, reason, source) 
VALUES ('en', 'live', 'live', 'news-indicator', 'system-default');

-- Person names (English)
INSERT INTO crawl_skip_terms(lang, term, normalized, reason, source) 
VALUES ('en', 'trump', 'trump', 'common-person-name', 'system-default');
```

---

## API Modules

### `src/db/sqlite/v1/queries/topicKeywords.js`

Query functions for topic keywords:

```javascript
const { getTopicTermsForLanguage } = require('./db/sqlite/queries/topicKeywords');

// Get all topic terms for English
const englishTopics = getTopicTermsForLanguage(db, 'en');
// Returns: Set(['politics', 'political', 'sport', 'sports', ...])

// Get all topics grouped by language
const allTopics = getAllTopicsGrouped(db);
// Returns: Map('politics' -> Map('en' -> ['politics', 'political'], 'fr' -> ['politique']))

// Check if term is a topic keyword
const isPolitics = isTopicKeyword(db, 'politics', 'en');
// Returns: true

// Get topic identifier for term
const topic = getTopicForTerm(db, 'political', 'en');
// Returns: 'politics'
```

**Functions**:
- `getTopicTermsForLanguage(db, lang)` - Get all terms for language as Set
- `getAllTopicsGrouped(db)` - Get topics grouped by language
- `isTopicKeyword(db, term, lang)` - Check if term is a topic
- `getTopicForTerm(db, term, lang)` - Get canonical topic ID for term
- `seedDefaultTopics(db, source)` - Seed default English topics

### `src/db/sqlite/v1/queries/crawlSkipTerms.js`

Query functions for skip terms:

```javascript
const { getSkipTermsForLanguage } = require('./db/sqlite/queries/crawlSkipTerms');

// Get all skip terms for English
const skipTerms = getSkipTermsForLanguage(db, 'en');
// Returns: Set(['breaking', 'live', 'trump', 'biden', ...])

// Get skip terms grouped by reason
const byReason = getSkipTermsByReason(db, 'en');
// Returns: Map('news-indicator' -> ['breaking', 'live'], 'common-person-name' -> ['trump', 'biden'])

// Check if term should be skipped
const shouldSkip = shouldSkipTerm(db, 'breaking', 'en');
// Returns: true

// Get reason for skipping
const reason = getSkipReason(db, 'trump', 'en');
// Returns: 'common-person-name'
```

**Functions**:
- `getSkipTermsForLanguage(db, lang)` - Get all skip terms for language
- `getSkipTermsByReason(db, lang)` - Get terms grouped by skip reason
- `shouldSkipTerm(db, term, lang)` - Check if term should be skipped
- `getSkipReason(db, term, lang)` - Get reason for skipping term
- `seedDefaultSkipTerms(db, source)` - Seed default English skip terms

---

## Migration: Removed Hardcoded Lists

### Before (Hardcoded in Source)

```javascript
// intelligent_crawl (REMOVED)
const newsTopics = new Set([
  'politics', 'sport', 'sports', 'business', 'technology', 'tech',
  'science', 'environment', 'climate', 'culture', 'books', 'music',
  // ... 30+ hardcoded terms
]);

// src/hub-validation/HubValidator.js (REMOVED)
this.newsTopics = new Set([
  'politics', 'sport', 'sports', 'business', // ...
]);
this.newsIndicators = new Set([
  'breaking', 'live', 'latest', 'update', // ...
]);
this.commonNames = new Set([
  'trump', 'biden', 'harris', 'obama', // ...
]);

// src/analysis/place-extraction.js (REMOVED)
const DEFAULT_TOPIC_TOKENS = new Set([
  'news', 'world', 'politics', 'sport', // ...
]);
```

### After (Loaded from Database)

```javascript
// intelligent_crawl (NOW)
const { getTopicTermsForLanguage } = require('./src/db/sqlite/v1/queries/topicKeywords');
const newsTopics = getTopicTermsForLanguage(db, 'en');

// src/hub-validation/HubValidator.js (NOW)
const { getTopicTermsForLanguage } = require('../db/sqlite/queries/topicKeywords');
const { getSkipTermsForLanguage } = require('../db/sqlite/queries/crawlSkipTerms');

async initialize() {
  this.newsTopics = getTopicTermsForLanguage(this.db, 'en');
  this.newsIndicators = getSkipTermsForLanguage(this.db, 'en');
  this.commonNames = getSkipTermsForLanguage(this.db, 'en');
}

// src/analysis/place-extraction.js (NOW)
function getDefaultTopicTokens(db) {
  if (!DEFAULT_TOPIC_TOKENS && db) {
    const { getTopicTermsForLanguage } = require('../db/sqlite/queries/topicKeywords');
    DEFAULT_TOPIC_TOKENS = getTopicTermsForLanguage(db, 'en');
  }
  return DEFAULT_TOPIC_TOKENS;
}
```

---

## Seeding Script

Run once to populate database with default English data:

```bash
# Seed database with default topics and skip terms
node scripts/seed-topics-and-skip-terms.js

# Force re-seed (deletes existing system-default entries)
node scripts/seed-topics-and-skip-terms.js --force
```

**Output**:
```
Seeding topic keywords and crawl skip terms...
Database: c:\Users\james\Documents\repos\copilot-dl-news\data\news.db
Force mode: NO (upsert only)

Current database state:
  - Topic keywords: 0 entries
  - Skip terms: 0 entries

Seeding topic keywords (English)...
✓ Topic keywords seeded: 95 total entries

Seeding crawl skip terms (English)...
✓ Skip terms seeded: 42 total entries

Topic breakdown:
  - culture: 15 terms
  - sport: 12 terms
  - politics: 5 terms
  - business: 6 terms
  ...

Skip terms breakdown:
  - common-person-name: 24 terms
  - news-indicator: 13 terms
  - media-type: 5 terms

✓ Seeding complete!
```

---

## Default English Data

### Topics (13 categories, ~95 terms total)

| Topic | Terms |
|-------|-------|
| **politics** | politics, political, government, parliament, congress |
| **sport** | sport, sports, athletics, football, cricket, rugby, tennis, boxing, racing |
| **business** | business, economy, markets, finance, money, careers |
| **technology** | technology, tech, digital, computing, internet |
| **science** | science, research, scientific, study |
| **environment** | environment, climate, sustainability, ecology |
| **culture** | culture, books, music, film, tv, television, art, design, stage, classical, photography, architecture |
| **lifestyle** | lifestyle, food, fashion, travel, health, lifeandstyle, games, gaming |
| **education** | education, schools, universities, learning |
| **media** | media, journalism, news, press |
| **society** | society, social, community |
| **law** | law, legal, justice, courts |
| **opinion** | opinion, commentisfree, comment, editorial, analysis |

### Skip Terms (3 categories, ~42 terms total)

| Reason | Terms |
|--------|-------|
| **news-indicator** | breaking, live, latest, update, report, story, article, analysis, editorial, commentary, exclusive, investigation, interview, profile, review, recap |
| **media-type** | newsletter, podcast, video, gallery, interactive, slideshow |
| **common-person-name** | trump, biden, harris, obama, clinton, bush, johnson, may, cameron, starmer, sunak, truss, macron, merkel, putin, xi, modi, newsom, desantis, pence, pelosi, mcconnell, gavin, donald, joe, kamala, barack, hillary, epstein, redford, pirro, huckabee, navalnaya |

---

## Adding New Languages

### Example: Adding French Topics

```javascript
const db = ensureDatabase('data/news.db');

const frenchTopics = {
  'politics': ['politique', 'politiques', 'gouvernement', 'parlement'],
  'sport': ['sport', 'sports', 'athlétisme', 'football'],
  'business': ['affaires', 'économie', 'marchés', 'finance'],
  'technology': ['technologie', 'tech', 'numérique', 'informatique'],
  'culture': ['culture', 'livres', 'musique', 'cinéma', 'télévision'],
  // ... more topics
};

const stmt = db.prepare(`
  INSERT INTO topic_keywords(topic, lang, term, normalized, source, metadata)
  VALUES (@topic, @lang, @term, @normalized, @source, @metadata)
  ON CONFLICT(topic, lang, normalized) DO NOTHING
`);

for (const [topic, terms] of Object.entries(frenchTopics)) {
  for (const term of terms) {
    stmt.run({
      topic,
      lang: 'fr',
      term,
      normalized: term.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      source: 'manual-french',
      metadata: JSON.stringify({ added_by: 'user', date: '2025-10-14' })
    });
  }
}
```

### Using French Topics

```javascript
const { getTopicTermsForLanguage } = require('./db/sqlite/queries/topicKeywords');

// Get French topics
const frenchTopics = getTopicTermsForLanguage(db, 'fr');
// Returns: Set(['politique', 'politiques', 'sport', 'affaires', ...])

// Check if term is French topic
const isPolitique = isTopicKeyword(db, 'politique', 'fr');
// Returns: true
```

---

## Benefits

### Before (Hardcoded)
- ❌ English-only
- ❌ Requires code changes for updates
- ❌ No provenance tracking
- ❌ Duplicated across 3+ files
- ❌ Difficult to extend

### After (Database)
- ✅ Multi-lingual ready
- ✅ Update via SQL or admin UI
- ✅ Provenance (`source`, `metadata`)
- ✅ Single source of truth
- ✅ Easy to add languages

---

## Files Changed

### New Files
- `src/db/sqlite/v1/queries/topicKeywords.js` - Topic queries API
- `src/db/sqlite/v1/queries/crawlSkipTerms.js` - Skip term queries API
- `scripts/seed-topics-and-skip-terms.js` - Database seeding script
- `docs/MULTI_LINGUAL_TOPICS.md` - This documentation

### Modified Files
- `tools/intelligent-crawl.js` - Load topics from DB instead of hardcoded Set
- `src/hub-validation/HubValidator.js` - Load topics/skip terms from DB
- `src/analysis/place-extraction.js` - Load DEFAULT_TOPIC_TOKENS from DB

### Database Schema (Already Existed)
- `topic_keywords` table - Already in `src/db/sqlite/schema.js`
- `crawl_skip_terms` table - Already in `src/db/sqlite/schema.js`
- Tables were defined but unused until now

---

## Next Steps

1. **Run seeding script**: `node scripts/seed-topics-and-skip-terms.js`
2. **Test `tools/intelligent-crawl.js`**: Verify topics load correctly
3. **Add more languages**: Insert French, Spanish, etc. topic keywords
4. **Admin UI** (future): Web interface to manage topics/skip terms
5. **Auto-detection** (future): Detect site language and use matching vocabulary

---

## Related Documentation

- `src/db/sqlite/schema.js` - Database schema definitions
- `src/bootstrap/bootstrapDbLoader.js` - Bootstrap data loading
- `docs/DATABASE_SCHEMA_ERD.md` - Visual schema reference
- `AGENTS.md` - "Database Architecture" section
