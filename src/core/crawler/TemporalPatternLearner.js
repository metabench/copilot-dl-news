const { getDb } = require('../../data/db');

/**
 * Temporal Pattern Learner - Learn when and how often to revisit hubs
 * 
 * Tracks temporal patterns to optimize crawl scheduling:
 * - Update frequency detection per hub
 * - Revisit scheduling based on historical patterns
 * - Breaking news hub identification
 * - Seasonal pattern recognition
 * - Optimal timing recommendations
 */

class TemporalPatternLearner {
  constructor({ db, logger = console } = {}) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.logger = logger;

    // Temporal patterns
    this.updatePatterns = new Map(); // hubUrl -> pattern
    this.seasonalPatterns = new Map(); // hubType -> seasonal data

    // Update frequency categories (in hours)
    this.frequencies = {
      'realtime': 1,      // Breaking news
      'hourly': 6,
      'daily': 24,
      'weekly': 168,
      'monthly': 720,
      'rarely': 8760      // Yearly
    };
  }

  /**
   * Learn update pattern from historical crawl data
   */
  async learnUpdatePattern(domain, hubUrl, hubType) {
    if (!this.db) return null;

    try {
      // Get historical visit data
      const stmt = this.db.prepare(`
        SELECT 
          visited_at,
          articles_found,
          new_articles
        FROM hub_visits
        WHERE domain = ? AND hub_url = ?
        ORDER BY visited_at DESC
        LIMIT 20
      `);

      const visits = stmt.all(domain, hubUrl);
      if (visits.length < 3) {
        return null; // Not enough data
      }

      // Calculate update frequency
      const pattern = this._analyzeUpdatePattern(visits);
      pattern.hubUrl = hubUrl;
      pattern.hubType = hubType;
      pattern.domain = domain;

      // Store pattern
      const key = `${domain}:${hubUrl}`;
      this.updatePatterns.set(key, pattern);

      // Persist to database
      await this._persistPattern(pattern);

      this.logger.log?.('[Temporal]', `Learned pattern for ${hubUrl}: ${pattern.frequency} (confidence: ${(pattern.confidence * 100).toFixed(1)}%)`);

      return pattern;
    } catch (error) {
      this.logger.error?.('Failed to learn update pattern', error);
      return null;
    }
  }

  /**
   * Record a hub visit for pattern learning
   */
  async recordVisit(domain, hubUrl, hubType, articlesFound, newArticles = 0) {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO hub_visits (
          domain, hub_url, hub_type, visited_at,
          articles_found, new_articles
        ) VALUES (?, ?, ?, datetime('now'), ?, ?)
      `);

      stmt.run(domain, hubUrl, hubType, articlesFound, newArticles);

      // Update pattern if enough visits accumulated
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM hub_visits
        WHERE domain = ? AND hub_url = ?
      `);
      const { count } = countStmt.get(domain, hubUrl);

      if (count >= 3 && count % 3 === 0) {
        // Relearn pattern every 3 visits
        await this.learnUpdatePattern(domain, hubUrl, hubType);
      }
    } catch (error) {
      this.logger.error?.('Failed to record visit', error);
    }
  }

  /**
   * Get recommended next visit time
   */
  async getNextVisitTime(domain, hubUrl) {
    const key = `${domain}:${hubUrl}`;
    
    // Check cached pattern
    let pattern = this.updatePatterns.get(key);
    
    // Load from database if not cached
    if (!pattern) {
      pattern = await this._loadPattern(domain, hubUrl);
      if (pattern) {
        this.updatePatterns.set(key, pattern);
      }
    }

    if (!pattern) {
      // No pattern learned, default to daily
      return {
        nextVisit: new Date(Date.now() + 24 * 60 * 60 * 1000),
        frequency: 'daily',
        confidence: 0.3
      };
    }

    // Calculate next visit based on pattern
    const frequencyHours = this.frequencies[pattern.frequency] || 24;
    const nextVisit = new Date(Date.now() + frequencyHours * 60 * 60 * 1000);

    // Adjust for time of day if pattern detected
    const adjusted = this._adjustForTimeOfDay(nextVisit, pattern);

    return {
      nextVisit: adjusted,
      frequency: pattern.frequency,
      confidence: pattern.confidence,
      reason: pattern.reason
    };
  }

  /**
   * Identify breaking news hubs (rapid updates)
   */
  async identifyBreakingNewsHubs(domain, threshold = 0.8) {
    const breakingHubs = [];

    for (const [key, pattern] of this.updatePatterns.entries()) {
      if (pattern.domain !== domain) continue;

      if (pattern.frequency === 'realtime' || pattern.frequency === 'hourly') {
        if (pattern.confidence >= threshold) {
          breakingHubs.push({
            url: pattern.hubUrl,
            frequency: pattern.frequency,
            confidence: pattern.confidence,
            avgNewArticles: pattern.avgNewArticles
          });
        }
      }
    }

    return breakingHubs.sort((a, b) => b.avgNewArticles - a.avgNewArticles);
  }

  /**
   * Detect seasonal patterns for a hub type
   */
  async detectSeasonalPatterns(domain, hubType) {
    if (!this.db) return null;

    try {
      // Get visit data spanning multiple months
      const stmt = this.db.prepare(`
        SELECT 
          strftime('%m', visited_at) as month,
          strftime('%w', visited_at) as day_of_week,
          AVG(new_articles) as avg_new,
          COUNT(*) as visit_count
        FROM hub_visits
        WHERE domain = ? AND hub_type = ?
        GROUP BY month, day_of_week
        HAVING visit_count >= 3
        ORDER BY month, day_of_week
      `);

      const data = stmt.all(domain, hubType);
      if (data.length < 12) {
        return null; // Not enough seasonal data
      }

      // Analyze for patterns
      const seasonal = this._analyzeSeasonalData(data);
      seasonal.hubType = hubType;
      seasonal.domain = domain;

      this.seasonalPatterns.set(`${domain}:${hubType}`, seasonal);

      return seasonal;
    } catch (error) {
      this.logger.error?.('Failed to detect seasonal patterns', error);
      return null;
    }
  }

  /**
   * Get optimal crawl timing for a hub
   */
  getOptimalCrawlTime(hubUrl, hubType, context = {}) {
    const key = `${context.domain}:${hubUrl}`;
    const pattern = this.updatePatterns.get(key);

    if (!pattern) {
      // Default to night time (low traffic)
      const now = new Date();
      const optimal = new Date(now);
      optimal.setHours(2, 0, 0, 0); // 2 AM local time
      if (optimal <= now) {
        optimal.setDate(optimal.getDate() + 1);
      }

      return {
        time: optimal,
        reason: 'Default off-peak timing',
        confidence: 0.3
      };
    }

    // Use learned pattern
    let recommendedHour = 2; // Default 2 AM

    if (pattern.peakUpdateHour !== undefined) {
      // Schedule slightly after peak update time
      recommendedHour = (pattern.peakUpdateHour + 1) % 24;
    }

    const now = new Date();
    const optimal = new Date(now);
    optimal.setHours(recommendedHour, 0, 0, 0);
    
    if (optimal <= now) {
      optimal.setDate(optimal.getDate() + 1);
    }

    return {
      time: optimal,
      reason: `Learned pattern: updates peak at ${pattern.peakUpdateHour}:00`,
      confidence: pattern.confidence
    };
  }

  /**
   * Should this hub be revisited now?
   */
  async shouldRevisit(domain, hubUrl) {
    const nextVisit = await this.getNextVisitTime(domain, hubUrl);
    
    const shouldVisit = new Date() >= nextVisit.nextVisit;
    const hoursSinceScheduled = (Date.now() - nextVisit.nextVisit.getTime()) / (60 * 60 * 1000);

    return {
      shouldVisit,
      reason: shouldVisit ? 
        `Scheduled visit ${hoursSinceScheduled >= 0 ? 'overdue' : 'due'} (${nextVisit.frequency})` :
        `Next visit in ${Math.abs(hoursSinceScheduled).toFixed(1)} hours`,
      nextVisit: nextVisit.nextVisit,
      frequency: nextVisit.frequency,
      confidence: nextVisit.confidence
    };
  }

  /**
   * Get temporal statistics for monitoring
   */
  getTemporalStats() {
    const stats = {
      patternsLearned: this.updatePatterns.size,
      byFrequency: {},
      avgConfidence: 0,
      breakingNewsCount: 0
    };

    let totalConf = 0;

    for (const pattern of this.updatePatterns.values()) {
      // Count by frequency
      stats.byFrequency[pattern.frequency] = (stats.byFrequency[pattern.frequency] || 0) + 1;

      // Sum confidence
      totalConf += pattern.confidence || 0;

      // Count breaking news
      if (pattern.frequency === 'realtime' || pattern.frequency === 'hourly') {
        stats.breakingNewsCount++;
      }
    }

    stats.avgConfidence = stats.patternsLearned > 0 ? totalConf / stats.patternsLearned : 0;

    return stats;
  }

  // Private helpers

  _analyzeUpdatePattern(visits) {
    // Calculate time between visits
    const intervals = [];
    for (let i = 0; i < visits.length - 1; i++) {
      const t1 = new Date(visits[i].visited_at).getTime();
      const t2 = new Date(visits[i + 1].visited_at).getTime();
      const hoursBetween = Math.abs(t1 - t2) / (60 * 60 * 1000);
      intervals.push(hoursBetween);
    }

    // Calculate average interval
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

    // Calculate variance for confidence
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coeffVariation = stdDev / avgInterval;

    // Low variation = high confidence
    const confidence = Math.max(0.3, Math.min(0.95, 1.0 - coeffVariation));

    // Classify frequency
    let frequency = 'daily';
    let reason = '';

    if (avgInterval <= 2) {
      frequency = 'realtime';
      reason = 'Rapid updates detected';
    } else if (avgInterval <= 12) {
      frequency = 'hourly';
      reason = 'Multiple updates per day';
    } else if (avgInterval <= 36) {
      frequency = 'daily';
      reason = 'Daily update pattern';
    } else if (avgInterval <= 200) {
      frequency = 'weekly';
      reason = 'Weekly update pattern';
    } else if (avgInterval <= 1000) {
      frequency = 'monthly';
      reason = 'Monthly update pattern';
    } else {
      frequency = 'rarely';
      reason = 'Infrequent updates';
    }

    // Calculate average new articles
    const avgNewArticles = visits.reduce((sum, v) => sum + (v.new_articles || 0), 0) / visits.length;

    // Detect peak update time (hour of day)
    const hourCounts = new Array(24).fill(0);
    for (const visit of visits) {
      const hour = new Date(visit.visited_at).getHours();
      hourCounts[hour] += visit.new_articles || 0;
    }
    const peakUpdateHour = hourCounts.indexOf(Math.max(...hourCounts));

    return {
      frequency,
      avgInterval,
      confidence,
      reason,
      avgNewArticles,
      peakUpdateHour,
      sampleSize: visits.length,
      lastUpdated: new Date().toISOString()
    };
  }

  _analyzeSeasonalData(data) {
    // Group by month
    const byMonth = {};
    for (const row of data) {
      const month = row.month;
      if (!byMonth[month]) {
        byMonth[month] = { visits: 0, avgNew: 0 };
      }
      byMonth[month].visits += row.visit_count;
      byMonth[month].avgNew += row.avg_new * row.visit_count;
    }

    // Calculate averages
    for (const month in byMonth) {
      byMonth[month].avgNew /= byMonth[month].visits;
    }

    // Find peak months
    const months = Object.keys(byMonth);
    months.sort((a, b) => byMonth[b].avgNew - byMonth[a].avgNew);

    const peakMonths = months.slice(0, 3).map(m => parseInt(m));
    const avgActivity = Object.values(byMonth).reduce((sum, m) => sum + m.avgNew, 0) / months.length;

    return {
      peakMonths,
      avgActivity,
      byMonth,
      confidence: data.length >= 20 ? 0.8 : 0.5
    };
  }

  _adjustForTimeOfDay(nextVisit, pattern) {
    if (pattern.peakUpdateHour === undefined) {
      return nextVisit;
    }

    // If we have a peak hour, schedule slightly after
    const targetHour = (pattern.peakUpdateHour + 1) % 24;
    nextVisit.setHours(targetHour, 0, 0, 0);

    return nextVisit;
  }

  async _loadPattern(domain, hubUrl) {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT pattern_data FROM temporal_patterns
        WHERE domain = ? AND hub_url = ?
        ORDER BY updated_at DESC LIMIT 1
      `);

      const row = stmt.get(domain, hubUrl);
      return row ? JSON.parse(row.pattern_data) : null;
    } catch (error) {
      return null;
    }
  }

  async _persistPattern(pattern) {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO temporal_patterns (
          domain, hub_url, hub_type, frequency,
          confidence, avg_new_articles, pattern_data,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        pattern.domain,
        pattern.hubUrl,
        pattern.hubType,
        pattern.frequency,
        pattern.confidence,
        pattern.avgNewArticles,
        JSON.stringify(pattern)
      );
    } catch (error) {
      this.logger.error?.('Failed to persist pattern', error);
    }
  }

  close() {
    this.updatePatterns.clear();
    this.seasonalPatterns.clear();
  }
}

module.exports = { TemporalPatternLearner };
