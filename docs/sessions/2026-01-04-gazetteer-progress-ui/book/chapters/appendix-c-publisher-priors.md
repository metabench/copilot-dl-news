# Appendix C: Publisher Priors Table

*Reference table of publisher geographic preferences for disambiguation*

---

## How Publisher Priors Work

When a publisher typically covers a specific region, that knowledge helps disambiguate place names. "London" from The Guardian is likely London UK. "London" from CBC is more likely London, Ontario.

**IMPORTANT**: All publisher profiles are stored in the database, not in JSON files or code constants. This enables learning from actual disambiguation outcomes and updating profiles without deployments.

---

## Database Schema

```sql
-- Publisher profiles table
CREATE TABLE publisher_profiles (
  profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,         -- 'theguardian.com'
  display_name TEXT,                    -- 'The Guardian'
  primary_country TEXT,                 -- 'GB'
  publisher_type TEXT,                  -- 'broadsheet', 'local', 'wire', 'tabloid'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sample_size INTEGER DEFAULT 0,        -- Articles used to build profile
  notes TEXT
);

-- Country weights per publisher (normalized, should sum to ~1.0)
CREATE TABLE publisher_country_weights (
  publisher_domain TEXT NOT NULL,
  country_iso2 TEXT NOT NULL,           -- 'GB', 'US', 'other'
  weight REAL NOT NULL,                 -- 0.0 to 1.0
  confidence REAL DEFAULT 0.5,          -- Confidence in this weight
  source TEXT DEFAULT 'manual',         -- 'manual', 'learned', 'inferred'
  PRIMARY KEY (publisher_domain, country_iso2),
  FOREIGN KEY (publisher_domain) REFERENCES publisher_profiles(domain)
);

-- Regional weights for local publishers (optional)
CREATE TABLE publisher_region_weights (
  publisher_domain TEXT NOT NULL,
  country_iso2 TEXT NOT NULL,
  region_code TEXT NOT NULL,            -- ADM1 code or name
  weight REAL NOT NULL,
  source TEXT DEFAULT 'manual',
  PRIMARY KEY (publisher_domain, country_iso2, region_code),
  FOREIGN KEY (publisher_domain) REFERENCES publisher_profiles(domain)
);

CREATE INDEX idx_pub_weights ON publisher_country_weights(publisher_domain);
CREATE INDEX idx_pub_region ON publisher_region_weights(publisher_domain);
```

## Publisher Profile Example

```sql
-- Insert publisher profile
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type, notes)
VALUES ('theguardian.com', 'The Guardian', 'GB', 'broadsheet', 'UK broadsheet with international coverage');

-- Insert country weights
INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  ('theguardian.com', 'GB', 0.65, 'manual'),
  ('theguardian.com', 'US', 0.15, 'manual'),
  ('theguardian.com', 'AU', 0.08, 'manual'),
  ('theguardian.com', 'other', 0.12, 'manual');
```

---

## Major Publishers Reference

### United Kingdom

| Domain | Name | Primary | GB | US | Other |
|--------|------|---------|----|----|-------|
| bbc.co.uk | BBC News | GB | 0.60 | 0.15 | 0.25 |
| theguardian.com | The Guardian | GB | 0.65 | 0.15 | 0.20 |
| telegraph.co.uk | The Telegraph | GB | 0.70 | 0.10 | 0.20 |
| dailymail.co.uk | Daily Mail | GB | 0.70 | 0.15 | 0.15 |
| thetimes.co.uk | The Times | GB | 0.70 | 0.10 | 0.20 |
| independent.co.uk | The Independent | GB | 0.65 | 0.15 | 0.20 |
| ft.com | Financial Times | GB | 0.40 | 0.25 | 0.35 |
| reuters.com | Reuters | — | 0.20 | 0.25 | 0.55 |
| sky.com | Sky News | GB | 0.65 | 0.10 | 0.25 |

### United States

| Domain | Name | Primary | US | GB | Other |
|--------|------|---------|----|----|-------|
| nytimes.com | New York Times | US | 0.70 | 0.08 | 0.22 |
| washingtonpost.com | Washington Post | US | 0.75 | 0.05 | 0.20 |
| wsj.com | Wall Street Journal | US | 0.65 | 0.10 | 0.25 |
| cnn.com | CNN | US | 0.60 | 0.10 | 0.30 |
| foxnews.com | Fox News | US | 0.80 | 0.05 | 0.15 |
| usatoday.com | USA Today | US | 0.85 | 0.03 | 0.12 |
| latimes.com | Los Angeles Times | US | 0.85 | 0.03 | 0.12 |
| chicagotribune.com | Chicago Tribune | US | 0.90 | 0.02 | 0.08 |
| npr.org | NPR | US | 0.75 | 0.05 | 0.20 |
| apnews.com | Associated Press | — | 0.45 | 0.10 | 0.45 |

### Canada

| Domain | Name | Primary | CA | US | GB | Other |
|--------|------|---------|----|----|-------|-------|
| cbc.ca | CBC News | CA | 0.85 | 0.08 | 0.02 | 0.05 |
| globalnews.ca | Global News | CA | 0.85 | 0.08 | 0.02 | 0.05 |
| theglobeandmail.com | Globe and Mail | CA | 0.80 | 0.10 | 0.03 | 0.07 |
| nationalpost.com | National Post | CA | 0.80 | 0.10 | 0.03 | 0.07 |
| torontostar.com | Toronto Star | CA | 0.90 | 0.05 | 0.02 | 0.03 |
| vancouversun.com | Vancouver Sun | CA | 0.92 | 0.04 | 0.01 | 0.03 |
| montrealgazette.com | Montreal Gazette | CA | 0.92 | 0.04 | 0.01 | 0.03 |
| ctvnews.ca | CTV News | CA | 0.85 | 0.08 | 0.02 | 0.05 |

### Australia

| Domain | Name | Primary | AU | GB | US | Other |
|--------|------|---------|----|----|-------|-------|
| abc.net.au | ABC Australia | AU | 0.80 | 0.05 | 0.05 | 0.10 |
| smh.com.au | Sydney Morning Herald | AU | 0.85 | 0.03 | 0.05 | 0.07 |
| theaustralian.com.au | The Australian | AU | 0.85 | 0.03 | 0.05 | 0.07 |
| news.com.au | News.com.au | AU | 0.85 | 0.03 | 0.05 | 0.07 |
| 9news.com.au | Nine News | AU | 0.88 | 0.02 | 0.04 | 0.06 |

### International / Wire Services

| Domain | Name | Notes | Weight Distribution |
|--------|------|-------|---------------------|
| reuters.com | Reuters | Global wire | Spread across all regions |
| apnews.com | AP | US-based global | US bias but international |
| afp.com | AFP | French global | EU bias but international |
| aljazeera.com | Al Jazeera | Middle East focus | QA 0.30, ME 0.40, other 0.30 |
| dw.com | Deutsche Welle | German international | DE 0.40, EU 0.30, other 0.30 |

---

## Regional / Local Publishers

For local publishers, add region-level weights for finer disambiguation:

```sql
-- Local publisher profile
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type)
VALUES ('sfchronicle.com', 'San Francisco Chronicle', 'US', 'local');

INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  ('sfchronicle.com', 'US', 0.95, 'manual'),
  ('sfchronicle.com', 'other', 0.05, 'manual');

INSERT INTO publisher_region_weights (publisher_domain, country_iso2, region_code, weight, source) VALUES
  ('sfchronicle.com', 'US', 'CA', 0.80, 'manual'),      -- California
  ('sfchronicle.com', 'US', 'other', 0.15, 'manual');   -- Rest of US
```

---

## Building Publisher Profiles

### Learning from Historical Data

Profiles can be learned from accumulated disambiguation results:

```javascript
class PublisherProfileLearner {
  constructor(db) {
    this.db = db;
  }
  
  async buildProfile(domain) {
    // Analyze past articles from this publisher
    const stats = this.db.all(`
      SELECT 
        p.country_iso2,
        COUNT(*) AS mention_count
      FROM articles a
      JOIN mentions m ON m.article_id = a.id
      JOIN places p ON p.id = m.resolved_place_id
      WHERE a.publisher_domain = ?
        AND m.confidence > 0.8
      GROUP BY p.country_iso2
      ORDER BY mention_count DESC
    `, [domain]);
    
    // Convert to weights
    const total = stats.reduce((sum, s) => sum + s.mention_count, 0);
    
    if (total < 10) {
      return null;  // Insufficient data
    }
    
    // Upsert profile
    this.db.run(`
      INSERT INTO publisher_profiles (domain, sample_size, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(domain) DO UPDATE SET
        sample_size = excluded.sample_size,
        updated_at = excluded.updated_at
    `, [domain, total]);
    
    // Update weights
    for (const s of stats) {
      const weight = s.mention_count / total;
      this.db.run(`
        INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source)
        VALUES (?, ?, ?, 'learned')
        ON CONFLICT(publisher_domain, country_iso2) DO UPDATE SET
          weight = excluded.weight,
          source = 'learned'
      `, [domain, s.country_iso2, weight]);
    }
    
    return {
      domain,
      sampleSize: total,
      generatedAt: new Date().toISOString()
    };
  }
  
  async refreshAllProfiles(minArticles = 50) {
    const publishers = this.db.all(`
      SELECT DISTINCT publisher_domain
      FROM articles
      GROUP BY publisher_domain
      HAVING COUNT(*) >= ?
    `, [minArticles]);
    
    for (const { publisher_domain } of publishers) {
      await this.buildProfile(publisher_domain);
    }
  }
}

// Usage: Refresh profiles periodically
// const learner = new PublisherProfileLearner(db);
// await learner.refreshAllProfiles(100);
```

### Manual Curation

For new publishers or those without history:

1. Check the publisher's "About" page for geographic focus
2. Sample 10–20 articles and note country mentions
3. Insert estimated weights with `source = 'manual'`
4. Validate against evaluation set
5. Refine based on error analysis

---

## Using Publisher Priors

```javascript
class PublisherPriorFeature {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000;  // 5 minutes
  }
  
  getProfile(domain) {
    // Check cache
    const cached = this.cache.get(domain);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.profile;
    }
    
    // Direct match
    let weights = this.db.all(`
      SELECT country_iso2, weight
      FROM publisher_country_weights
      WHERE publisher_domain = ?
    `, [domain]);
    
    // Try parent domain if no match
    if (weights.length === 0) {
      const parts = domain.split('.');
      if (parts.length > 2) {
        const parent = parts.slice(-2).join('.');
        weights = this.db.all(`
          SELECT country_iso2, weight
          FROM publisher_country_weights
          WHERE publisher_domain = ?
        `, [parent]);
      }
    }
    
    const profile = {
      domain,
      countryWeights: Object.fromEntries(weights.map(w => [w.country_iso2, w.weight])),
      unknown: weights.length === 0
    };
    
    this.cache.set(domain, { profile, timestamp: Date.now() });
    return profile;
  }
  
  compute(candidate, publisherDomain) {
    if (!publisherDomain || !candidate.country_iso2) {
      return 0.5;  // Neutral
    }
    
    const profile = this.getProfile(publisherDomain);
    
    if (profile.unknown) {
      return 0.5;  // Unknown publisher = neutral
    }
    
    const weight = profile.countryWeights[candidate.country_iso2];
    if (weight !== undefined) {
      return weight;
    }
    
    // Check "other" bucket
    if (profile.countryWeights.other !== undefined) {
      return profile.countryWeights.other;
    }
    
    return 0.1;  // Not in profile = low prior
  }
}
```

---

## Updating Publisher Priors

Profiles are updated automatically as disambiguation results accumulate:

```javascript
// Scheduled profile refresh (run daily or weekly)
async function refreshPublisherProfiles(db) {
  const learner = new PublisherProfileLearner(db);
  
  // Only refresh publishers with sufficient new data
  const stalePublishers = db.all(`
    SELECT p.domain, COUNT(a.id) as new_articles
    FROM publisher_profiles p
    JOIN articles a ON a.publisher_domain = p.domain
    WHERE a.created_at > p.updated_at
    GROUP BY p.domain
    HAVING COUNT(a.id) >= 50
  `);
  
  for (const pub of stalePublishers) {
    await learner.buildProfile(pub.domain);
    console.log(`Refreshed ${pub.domain} with ${pub.new_articles} new articles`);
  }
}

// Validation against evaluation set
async function validateProfiles(db, evalSet) {
  const results = { correct: 0, total: 0, byPublisher: {} };
  
  for (const example of evalSet) {
    const prior = new PublisherPriorFeature(db);
    const score = prior.compute(example.candidate, example.publisherDomain);
    
    const correct = (score > 0.5 && example.isCorrect) || (score <= 0.5 && !example.isCorrect);
    results.total++;
    if (correct) results.correct++;
    
    // Track per-publisher accuracy
    const key = example.publisherDomain;
    results.byPublisher[key] = results.byPublisher[key] || { correct: 0, total: 0 };
    results.byPublisher[key].total++;
    if (correct) results.byPublisher[key].correct++;
  }
  
  return results;
}
```

---

## Seed Data: Major Publishers

Use these SQL statements to seed the database with initial publisher profiles:

```sql
-- United Kingdom
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type) VALUES
  ('bbc.co.uk', 'BBC News', 'GB', 'broadsheet'),
  ('theguardian.com', 'The Guardian', 'GB', 'broadsheet'),
  ('telegraph.co.uk', 'The Telegraph', 'GB', 'broadsheet'),
  ('dailymail.co.uk', 'Daily Mail', 'GB', 'tabloid'),
  ('thetimes.co.uk', 'The Times', 'GB', 'broadsheet'),
  ('independent.co.uk', 'The Independent', 'GB', 'broadsheet'),
  ('ft.com', 'Financial Times', 'GB', 'broadsheet'),
  ('sky.com', 'Sky News', 'GB', 'broadsheet');

INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  -- BBC
  ('bbc.co.uk', 'GB', 0.60, 'manual'),
  ('bbc.co.uk', 'US', 0.15, 'manual'),
  ('bbc.co.uk', 'other', 0.25, 'manual'),
  -- The Guardian
  ('theguardian.com', 'GB', 0.65, 'manual'),
  ('theguardian.com', 'US', 0.15, 'manual'),
  ('theguardian.com', 'AU', 0.08, 'manual'),
  ('theguardian.com', 'other', 0.12, 'manual'),
  -- Telegraph
  ('telegraph.co.uk', 'GB', 0.70, 'manual'),
  ('telegraph.co.uk', 'US', 0.10, 'manual'),
  ('telegraph.co.uk', 'other', 0.20, 'manual');

-- United States
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type) VALUES
  ('nytimes.com', 'New York Times', 'US', 'broadsheet'),
  ('washingtonpost.com', 'Washington Post', 'US', 'broadsheet'),
  ('wsj.com', 'Wall Street Journal', 'US', 'broadsheet'),
  ('cnn.com', 'CNN', 'US', 'broadsheet'),
  ('foxnews.com', 'Fox News', 'US', 'broadsheet'),
  ('npr.org', 'NPR', 'US', 'broadsheet'),
  ('apnews.com', 'Associated Press', NULL, 'wire');

INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  ('nytimes.com', 'US', 0.70, 'manual'),
  ('nytimes.com', 'GB', 0.08, 'manual'),
  ('nytimes.com', 'other', 0.22, 'manual'),
  ('washingtonpost.com', 'US', 0.75, 'manual'),
  ('washingtonpost.com', 'other', 0.25, 'manual'),
  ('cnn.com', 'US', 0.60, 'manual'),
  ('cnn.com', 'other', 0.40, 'manual'),
  ('apnews.com', 'US', 0.45, 'manual'),
  ('apnews.com', 'other', 0.55, 'manual');

-- Canada
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type) VALUES
  ('cbc.ca', 'CBC News', 'CA', 'broadsheet'),
  ('globalnews.ca', 'Global News', 'CA', 'broadsheet'),
  ('theglobeandmail.com', 'Globe and Mail', 'CA', 'broadsheet'),
  ('torontostar.com', 'Toronto Star', 'CA', 'local');

INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  ('cbc.ca', 'CA', 0.85, 'manual'),
  ('cbc.ca', 'US', 0.08, 'manual'),
  ('cbc.ca', 'other', 0.07, 'manual'),
  ('torontostar.com', 'CA', 0.90, 'manual'),
  ('torontostar.com', 'other', 0.10, 'manual');

-- Australia
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type) VALUES
  ('abc.net.au', 'ABC Australia', 'AU', 'broadsheet'),
  ('smh.com.au', 'Sydney Morning Herald', 'AU', 'broadsheet'),
  ('theaustralian.com.au', 'The Australian', 'AU', 'broadsheet');

INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  ('abc.net.au', 'AU', 0.80, 'manual'),
  ('abc.net.au', 'GB', 0.05, 'manual'),
  ('abc.net.au', 'US', 0.05, 'manual'),
  ('abc.net.au', 'other', 0.10, 'manual');

-- International / Wire Services
INSERT INTO publisher_profiles (domain, display_name, primary_country, publisher_type, notes) VALUES
  ('reuters.com', 'Reuters', NULL, 'wire', 'Global wire service'),
  ('aljazeera.com', 'Al Jazeera', 'QA', 'broadsheet', 'Middle East focus'),
  ('dw.com', 'Deutsche Welle', 'DE', 'broadsheet', 'German international');

INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source) VALUES
  ('reuters.com', 'US', 0.20, 'manual'),
  ('reuters.com', 'GB', 0.20, 'manual'),
  ('reuters.com', 'EU', 0.20, 'manual'),
  ('reuters.com', 'other', 0.40, 'manual'),
  ('aljazeera.com', 'QA', 0.30, 'manual'),
  ('aljazeera.com', 'ME', 0.40, 'manual'),
  ('aljazeera.com', 'other', 0.30, 'manual'),
  ('dw.com', 'DE', 0.40, 'manual'),
  ('dw.com', 'EU', 0.30, 'manual'),
  ('dw.com', 'other', 0.30, 'manual');
```

---

## Quick Reference

| Publisher Type | Primary Weight | Characteristic |
|----------------|----------------|----------------|
| National broadsheet | 0.65–0.75 | Strong home country, some international |
| Local newspaper | 0.90–0.95 | Very strong regional focus |
| Wire service | 0.25–0.45 | Distributed global coverage |
| International broadcaster | 0.40–0.60 | Home bias but significant global |
| Tabloid | 0.75–0.85 | Strong home focus, celebrity international |

---

*End of Appendices*

---

*Return to [Table of Contents](../README.md)*
