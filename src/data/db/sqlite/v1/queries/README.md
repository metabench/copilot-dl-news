# SQLite Query Modules

**When to Read**: Read this if you are adding or modifying a database query. This document explains the pattern for organizing SQL queries into reusable modules.

This directory hosts query helpers that wrap raw SQL statements for the SQLite adapter. Each module:

- Accepts an active `better-sqlite3` handle.
- Prepares statements once per handle using `getCachedStatements` from `helpers.js`.
- Exposes small, dependency-free functions that return POJOs or primitive values.
- Never imports from UI, crawler, or tooling layers.

Consumers (UI data helpers, services, tools, tests) should call these query helpers instead of embedding SQL strings. This keeps all SQLite-specific knowledge in one place and aligns with the modularisation plan described in `AGENTS.md`.

---

## Multi-Lingual Vocabulary Modules (October 2025)

### `topicKeywords.js` - Topic category keywords (multi-lingual)

Query functions for `topic_keywords` table (news categories like politics, sport, business):

```javascript
const { getTopicTermsForLanguage } = require('./topicKeywords');

// Get all English topic terms
const topics = getTopicTermsForLanguage(db, 'en');
// Returns: Set(['politics', 'political', 'sport', 'sports', ...])
```

**Functions**:
- `getTopicTermsForLanguage(db, lang)` - Get all terms as Set
- `getAllTopicsGrouped(db)` - Get topics grouped by language
- `isTopicKeyword(db, term, lang)` - Check if term is a topic
- `getTopicForTerm(db, term, lang)` - Get canonical topic ID
- `seedDefaultTopics(db, source)` - Seed default English topics

### `crawlSkipTerms.js` - Terms to skip during crawling (multi-lingual)

Query functions for `crawl_skip_terms` table (news indicators, person names):

```javascript
const { getSkipTermsForLanguage } = require('./crawlSkipTerms');

// Get all English skip terms
const skipTerms = getSkipTermsForLanguage(db, 'en');
// Returns: Set(['breaking', 'live', 'trump', 'biden', ...])
```

**Functions**:
- `getSkipTermsForLanguage(db, lang)` - Get all skip terms as Set
- `getSkipTermsByReason(db, lang)` - Get terms grouped by reason
- `shouldSkipTerm(db, term, lang)` - Check if should skip
- `getSkipReason(db, term, lang)` - Get skip reason
- `seedDefaultSkipTerms(db, source)` - Seed default English terms

**See**: `docs/MULTI_LINGUAL_TOPICS.md` for complete architecture and usage examples.
