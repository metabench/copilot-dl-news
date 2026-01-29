'use strict';

const EventEmitter = require('events');
const cheerio = require('cheerio');

/**
 * HubTaskGenerator - Creates crawl tasks from verified place hubs.
 *
 * This service bridges the place hub discovery system with the crawler:
 * 1. Reads verified hubs from place_page_mappings
 * 2. Probes each hub for pagination depth
 * 3. Generates crawl tasks for each page
 * 4. Tracks archive progress
 *
 * The generator supports two modes:
 * - Depth Probe: Determine pagination depth without crawling content
 * - Archive Crawl: Generate tasks for crawling historical pages
 */
class HubTaskGenerator extends EventEmitter {
  constructor({ db, fetcher, logger = console } = {}) {
    super();
    this.db = db;
    this.fetcher = fetcher;
    this.logger = logger;
    this.isRunning = false;
    this.abortController = null;
  }

  /**
   * Probe the depth of a single hub using exponential search + binary search.
   * Returns { maxPage, oldestDate, error }
   */
  async probeHubDepth(hub, options = {}) {
    const {
      maxProbePages = 5000,
      probeDelayMs = 500,
      userAgent = 'Mozilla/5.0 (HubDepthProbe/1.0)'
    } = options;

    const result = {
      hubId: hub.id,
      url: hub.url,
      placeName: hub.placeName,
      maxPage: 0,
      oldestDate: null,
      error: null
    };

    try {
      // Get page 1 signature for loopback detection
      const page1 = await this._checkPage(hub.url, 1, { userAgent });
      if (!page1.ok || page1.articleCount === 0) {
        result.error = 'Page 1 empty or failed';
        return result;
      }

      const page1Signature = page1.signature;
      result.maxPage = 1;
      result.oldestDate = page1.oldestDate;

      this.emit('probe:page1', { hub, page1 });

      // Exponential search for upper bound
      let lower = 1;
      let upper = 2;
      let lastGood = { page: 1, ...page1 };

      while (upper <= maxProbePages) {
        if (this.abortController?.signal.aborted) {
          result.error = 'Aborted';
          break;
        }

        await this._delay(probeDelayMs);
        const pageResult = await this._checkPage(hub.url, upper, { userAgent });

        // Time travel detection (loopback to page 1)
        if (pageResult.ok && pageResult.articleCount > 0 && lastGood.oldestDate) {
          const daysDiff = this._daysDiff(pageResult.oldestDate, lastGood.oldestDate);
          if (daysDiff > 7) {
            this.emit('probe:loopback', { hub, page: upper, daysDiff });
            break;
          }
        }

        // Signature-based loopback detection
        if (pageResult.ok && pageResult.signature === page1Signature && upper > 1) {
          this.emit('probe:loopback', { hub, page: upper, reason: 'signature-match' });
          break;
        }

        if (pageResult.ok && pageResult.articleCount > 0) {
          lastGood = { page: upper, ...pageResult };
          lower = upper;
          upper *= 2;
          this.emit('probe:page', { hub, page: lower, articleCount: pageResult.articleCount });
        } else {
          break;
        }
      }

      // Binary search to find exact boundary
      let left = lower + 1;
      let right = Math.min(upper - 1, maxProbePages);

      while (left <= right) {
        if (this.abortController?.signal.aborted) break;

        const mid = Math.floor((left + right) / 2);
        await this._delay(probeDelayMs);
        const midResult = await this._checkPage(hub.url, mid, { userAgent });

        // Time travel check in binary search
        if (midResult.ok && midResult.articleCount > 0 && lastGood.oldestDate) {
          const daysDiff = this._daysDiff(midResult.oldestDate, lastGood.oldestDate);
          if (daysDiff > 7) {
            right = mid - 1;
            continue;
          }
        }

        if (midResult.ok && midResult.articleCount > 0) {
          lastGood = { page: mid, ...midResult };
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      result.maxPage = lastGood.page;
      result.oldestDate = lastGood.oldestDate;

      this.emit('probe:complete', result);

    } catch (err) {
      result.error = err.message;
      this.emit('probe:error', { hub, error: err });
    }

    return result;
  }

  /**
   * Check a single paginated page
   */
  async _checkPage(baseUrl, pageNum, options = {}) {
    const url = `${baseUrl}?page=${pageNum}`;
    const result = {
      ok: false,
      status: null,
      articleCount: 0,
      oldestDate: null,
      newestDate: null,
      signature: null
    };

    try {
      const response = await this.fetcher(url, {
        headers: { 'User-Agent': options.userAgent || 'Mozilla/5.0' },
        redirect: 'follow'
      });

      result.status = response.status;
      if (!response.ok) return result;

      // Check for redirect back to page 1
      if (pageNum > 1 && response.url && !response.url.includes(`page=${pageNum}`)) {
        result.status = 'redirect-to-page1';
        return result;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract dates
      const dates = [];
      $('time').each((_, el) => {
        const dt = $(el).attr('datetime');
        if (dt) dates.push(dt);
      });

      if (dates.length === 0) {
        result.ok = true;
        return result;
      }

      dates.sort();
      result.articleCount = dates.length;
      result.oldestDate = dates[0];
      result.newestDate = dates[dates.length - 1];

      // Build signature from article links for loopback detection
      const articleLinks = new Set();
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        // Common article patterns
        if (href && href.match(/\/\d{4}\/\w{2,3}\/\d{1,2}\//)) {
          articleLinks.add(href);
          if (articleLinks.size >= 3) return false;
        }
      });
      result.signature = Array.from(articleLinks).join('|') || dates.slice(0, 3).join('|');

      result.ok = true;

    } catch (err) {
      result.error = err.message;
    }

    return result;
  }

  /**
   * Generate archive crawl tasks for a hub
   */
  generateArchiveTasks(hub, options = {}) {
    const {
      startPage = 2,
      endPage = hub.maxPageDepth || 100,
      pagesPerBatch = 50,
      priority = 'normal'
    } = options;

    const tasks = [];
    const actualEndPage = Math.min(endPage, hub.maxPageDepth || endPage);

    for (let page = startPage; page <= actualEndPage; page++) {
      tasks.push({
        kind: 'hub-archive-page',
        hubId: hub.id,
        placeId: hub.placeId,
        placeName: hub.placeName,
        host: hub.host,
        url: `${hub.url}?page=${page}`,
        baseUrl: hub.url,
        page,
        priority: this._calculatePagePriority(hub, page, priority),
        metadata: {
          placeKind: hub.placeKind,
          countryCode: hub.countryCode,
          totalPages: actualEndPage
        }
      });
    }

    return tasks;
  }

  /**
   * Run depth probe for multiple hubs
   */
  async runDepthProbe(options = {}) {
    const {
      host = null,
      hubLimit = 50,
      pageKind = 'country-hub',
      orderBy = 'oldest_check',
      depthCheckMaxAgeHours = 168,
      probeDelayMs = 500
    } = options;

    this.isRunning = true;
    this.abortController = new AbortController();

    const { getVerifiedHubsForArchive, updateHubDepthCheck } = require('../data/db/sqlite/v1/queries/placePageMappings');

    const hubs = getVerifiedHubsForArchive(this.db, {
      host,
      pageKind,
      limit: hubLimit,
      orderBy,
      needsDepthCheck: true,
      depthCheckMaxAgeHours
    });

    this.emit('probe:start', { hubCount: hubs.length, options });

    const results = [];
    for (const hub of hubs) {
      if (this.abortController.signal.aborted) break;

      this.emit('probe:hub:start', hub);

      const result = await this.probeHubDepth(hub, { probeDelayMs });
      results.push(result);

      // Update database
      if (!result.error) {
        updateHubDepthCheck(this.db, {
          id: hub.id,
          maxPageDepth: result.maxPage,
          oldestContentDate: result.oldestDate
        });
      } else {
        updateHubDepthCheck(this.db, {
          id: hub.id,
          maxPageDepth: hub.maxPageDepth || 0,
          oldestContentDate: hub.oldestContentDate,
          error: result.error
        });
      }

      this.emit('probe:hub:complete', result);
    }

    this.isRunning = false;
    this.emit('probe:finish', { results });

    return results;
  }

  /**
   * Generate and persist crawl tasks for verified hubs
   */
  async generateAndPersistTasks(options = {}) {
    const {
      host = null,
      hubLimit = 10,
      minDepth = 2,
      pagesPerHub = 100,
      startPage = 2,
      jobId = null
    } = options;

    const { getHubsNeedingArchive } = require('../data/db/sqlite/v1/queries/placePageMappings');

    const hubs = getHubsNeedingArchive(this.db, { host, minDepth, limit: hubLimit });

    this.emit('tasks:generate:start', { hubCount: hubs.length });

    let totalTasks = 0;

    for (const hub of hubs) {
      const endPage = pagesPerHub === 0
        ? hub.maxPageDepth
        : Math.min(startPage + pagesPerHub - 1, hub.maxPageDepth);

      const tasks = this.generateArchiveTasks(hub, { startPage, endPage });

      // Persist tasks to crawl_tasks table
      const insertStmt = this.db.prepare(`
        INSERT INTO crawl_tasks (job_id, host, kind, status, url, payload, note, created_at, updated_at)
        VALUES (@jobId, @host, @kind, 'pending', @url, @payload, @note, datetime('now'), datetime('now'))
      `);

      const insertMany = this.db.transaction((tasks) => {
        for (const task of tasks) {
          insertStmt.run({
            jobId: jobId || 'hub-archive-batch',
            host: task.host,
            kind: task.kind,
            url: task.url,
            payload: JSON.stringify(task.metadata),
            note: `${task.placeName} page ${task.page}/${task.metadata.totalPages}`
          });
        }
      });

      insertMany(tasks);
      totalTasks += tasks.length;

      this.emit('tasks:generate:hub', { hub, taskCount: tasks.length });
    }

    this.emit('tasks:generate:complete', { totalTasks, hubCount: hubs.length });

    return { totalTasks, hubCount: hubs.length };
  }

  /**
   * Stop any running operations
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  // Helper methods

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _daysDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (d1 - d2) / (1000 * 3600 * 24);
  }

  _calculatePagePriority(hub, page, basePriority) {
    // Earlier pages (more recent content) get higher priority
    const recencyBoost = Math.max(0, 1 - (page / (hub.maxPageDepth || 100)));
    // High-population places get priority boost
    const populationBoost = Math.log10((hub.population || 1000) + 1) / 10;

    const priorityMap = { high: 100, normal: 50, low: 10 };
    const base = priorityMap[basePriority] || 50;

    return Math.round(base + (recencyBoost * 30) + (populationBoost * 20));
  }
}

module.exports = { HubTaskGenerator };

