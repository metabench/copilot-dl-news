/**
 * ReportWriter - JSON report generation and file writing utilities
 *
 * Handles building JSON summaries, writing reports to disk, and
 * aggregating summary data for place hub discovery workflows.
 */

const path = require('path');
const fs = require('fs');

class ReportWriter {
  /**
   * Aggregate summary data into target object
   * @param {Object} target - Target summary object
   * @param {Object} source - Source summary data
   * @param {Object} entry - Entry context
   */
  static aggregateSummaryInto(target, source, entry) {
    if (!target || !source) return;

    for (const field of this.SUMMARY_NUMERIC_FIELDS) {
      const value = Number(source[field]) || 0;
      target[field] = (target[field] || 0) + value;
    }

    if (Array.isArray(source.unsupportedKinds) && source.unsupportedKinds.length) {
      const merged = new Set(target.unsupportedKinds);
      for (const kind of source.unsupportedKinds) {
        if (kind) merged.add(kind);
      }
      target.unsupportedKinds = Array.from(merged);
    }

    if (Array.isArray(source.decisions) && source.decisions.length) {
      for (const decision of source.decisions) {
        if (decision && typeof decision === 'object') {
          target.decisions.push({
            ...decision,
            domain: decision.domain || source.domain || entry?.domain || null
          });
        } else {
          target.decisions.push(decision);
        }
      }
    }

    if (source.diffPreview && typeof source.diffPreview === 'object') {
      if (!target.diffPreview || typeof target.diffPreview !== 'object') {
        target.diffPreview = {
          inserted: [],
          updated: []
        };
      }

      if (Array.isArray(source.diffPreview.inserted)) {
        for (const inserted of source.diffPreview.inserted) {
          if (!inserted || typeof inserted !== 'object') continue;
          target.diffPreview.inserted.push({
            ...inserted,
            domain: inserted.domain || entry?.domain || source.domain || null
          });
        }
      }

      if (Array.isArray(source.diffPreview.updated)) {
        for (const updated of source.diffPreview.updated) {
          if (!updated || typeof updated !== 'object') continue;
          const cloned = {
            ...updated,
            domain: updated.domain || entry?.domain || source.domain || null
          };
          if (Array.isArray(updated.changes)) {
            cloned.changes = updated.changes.map((change) => ({ ...change }));
          }
          target.diffPreview.updated.push(cloned);
        }
      }
    }

    if (source.validationFailureReasons && typeof source.validationFailureReasons === 'object') {
      if (!target.validationFailureReasons || typeof target.validationFailureReasons !== 'object') {
        target.validationFailureReasons = {};
      }
      for (const [reason, count] of Object.entries(source.validationFailureReasons)) {
        if (reason) {
          const numericCount = Number(count) || 0;
          target.validationFailureReasons[reason] = (target.validationFailureReasons[reason] || 0) + numericCount;
        }
      }
    }
  }

  /**
   * Create snapshot of diff preview
   * @param {Object} diffPreview - Diff preview data
   * @returns {Object} Snapshot
   */
  static snapshotDiffPreview(diffPreview) {
    const inserted = Array.isArray(diffPreview?.inserted)
      ? diffPreview.inserted.map((item) => (item && typeof item === 'object' ? { ...item } : item))
      : [];
    const updated = Array.isArray(diffPreview?.updated)
      ? diffPreview.updated.map((item) => {
          if (!item || typeof item !== 'object') {
            return item;
          }
          const cloned = { ...item };
          if (Array.isArray(item.changes)) {
            cloned.changes = item.changes.map((change) => (change && typeof change === 'object' ? { ...change } : change));
          }
          return cloned;
        })
      : [];

    return {
      insertedCount: inserted.length,
      updatedCount: updated.length,
      totalChanges: inserted.length + updated.length,
      inserted,
      updated
    };
  }

  /**
   * Collect hub changes between existing and new snapshots
   * @param {Object} existingHub - Existing hub data
   * @param {Object} nextSnapshot - New snapshot data
   * @returns {Array} Changes array
   */
  static collectHubChanges(existingHub, nextSnapshot) {
    if (!existingHub || !nextSnapshot) {
      return [];
    }

    const descriptors = [
      { label: 'Place slug', nextKey: 'placeSlug', existingKey: 'place_slug' },
      { label: 'Place kind', nextKey: 'placeKind', existingKey: 'place_kind' },
      { label: 'Title', nextKey: 'title', existingKey: 'title' },
      { label: 'Nav links', nextKey: 'navLinksCount', existingKey: 'nav_links_count' },
      { label: 'Article links', nextKey: 'articleLinksCount', existingKey: 'article_links_count' }
    ];

    const changes = [];
    for (const descriptor of descriptors) {
      const after = nextSnapshot[descriptor.nextKey];
      if (after === undefined || after === null) {
        continue;
      }
      const before = existingHub[descriptor.existingKey];
      const normalizedBefore = before === undefined ? null : before;
      const normalizedAfter = after;
      if (normalizedBefore === normalizedAfter) {
        continue;
      }
      if (typeof normalizedBefore === 'number' && typeof normalizedAfter === 'number' && Number.isFinite(normalizedBefore) && Number.isFinite(normalizedAfter)) {
        if (normalizedBefore === normalizedAfter) {
          continue;
        }
      }
      changes.push({
        field: descriptor.label,
        before: normalizedBefore === undefined ? null : normalizedBefore,
        after: normalizedAfter
      });
    }

    return changes;
  }

  /**
   * Summarize DSPL patterns for given kinds
   * @param {Object} dsplEntry - DSPL entry data
   * @param {string[]} kinds - Place kinds to summarize
   * @returns {Object} Summary
   */
  static summarizeDsplPatterns(dsplEntry, kinds) {
    const normalizedKinds = (Array.isArray(kinds) && kinds.length ? kinds : ['country'])
      .map((kind) => String(kind).toLowerCase());

    const summary = {
      available: Boolean(dsplEntry),
      requestedKinds: normalizedKinds,
      verifiedKinds: [],
      totalPatterns: 0,
      verifiedPatternCount: 0,
      byKind: {}
    };

    if (!dsplEntry) {
      return summary;
    }

    for (const kind of normalizedKinds) {
      const property = this.DSPL_KIND_PROPERTY_MAP[kind] || `${kind}HubPatterns`;
      const patterns = Array.isArray(dsplEntry[property]) ? dsplEntry[property] : [];
      const verifiedPatterns = patterns.filter((pattern) => pattern && pattern.verified !== false);

      summary.byKind[kind] = {
        total: patterns.length,
        verified: verifiedPatterns.length
      };

      summary.totalPatterns += patterns.length;
      summary.verifiedPatternCount += verifiedPatterns.length;

      if (verifiedPatterns.length) {
        summary.verifiedKinds.push(kind);
      }
    }

    return summary;
  }

  /**
   * Build JSON summary from batch results
   * @param {Object} summary - Summary data
   * @param {Object} options - Options
   * @param {Array} logEntries - Log entries
   * @returns {Object} JSON summary
   */
  static buildJsonSummary(summary, options = {}, logEntries = []) {
    const totals = this.SUMMARY_NUMERIC_FIELDS.reduce((acc, field) => {
      acc[field] = summary && summary[field] != null ? summary[field] : 0;
      return acc;
    }, {});

    const diffSnapshot = this.snapshotDiffPreview(summary?.diffPreview || {});

    const cloneFailureReasons = (source) => {
      if (!source || typeof source !== 'object') {
        return {};
      }
      const cloned = {};
      for (const [reason, count] of Object.entries(source)) {
        if (!reason) continue;
        const numeric = Number(count);
        cloned[reason] = Number.isFinite(numeric) ? numeric : 0;
      }
      return cloned;
    };

    const deriveCandidateMetrics = (numericMetrics = {}, summarySource = {}) => ({
      generated: numericMetrics.totalUrls ?? 0,
      cachedHits: numericMetrics.cached ?? 0,
      cachedKnown404: summarySource.skipped ?? numericMetrics.skipped ?? 0,
      cachedRecent4xx: numericMetrics.skippedRecent4xx ?? 0,
      duplicates: numericMetrics.skippedDuplicatePlace ?? 0,
      stored404: numericMetrics.stored404 ?? 0,
      fetchedOk: numericMetrics.fetched ?? 0,
      validationPassed: summarySource.validationSucceeded ?? numericMetrics.validationSucceeded ?? 0,
      validationFailed: summarySource.validationFailed ?? numericMetrics.validationFailed ?? 0,
      rateLimited: numericMetrics.rateLimited ?? 0,
      persistedInserts: numericMetrics.insertedHubs ?? 0,
      persistedUpdates: numericMetrics.updatedHubs ?? 0,
      errors: numericMetrics.errors ?? 0
    });

    const domainSummaries = Array.isArray(summary?.domainSummaries)
      ? summary.domainSummaries.map((entry) => {
          const domainSummary = entry?.summary || {};
          const domainDiff = this.snapshotDiffPreview(entry?.diffPreview || domainSummary?.diffPreview || {});
          const metrics = this.SUMMARY_NUMERIC_FIELDS.reduce((acc, field) => {
            acc[field] = domainSummary[field] != null ? domainSummary[field] : 0;
            return acc;
          }, {});
          const statusValue = entry?.determination
            || entry?.readiness?.status
            || (entry?.error ? 'error' : 'processed');
          const validationSummary = {
            passed: domainSummary.validationSucceeded ?? metrics.validationSucceeded ?? 0,
            failed: domainSummary.validationFailed ?? metrics.validationFailed ?? 0,
            failureReasons: cloneFailureReasons(domainSummary.validationFailureReasons)
          };
          const candidateMetrics = deriveCandidateMetrics(metrics, domainSummary);
          const timing = {
            startedAt: domainSummary.startedAt || null,
            completedAt: domainSummary.completedAt || null,
            durationMs: Number.isFinite(domainSummary.durationMs) ? domainSummary.durationMs : null
          };

          return {
            index: entry?.index ?? null,
            domain: entry?.domain ?? null,
            scheme: entry?.scheme ?? null,
            base: entry?.base ?? null,
            kinds: Array.isArray(entry?.kinds) ? [...entry.kinds] : [],
            limit: entry?.limit ?? null,
            sources: Array.isArray(entry?.sources) ? [...entry.sources] : [],
            status: statusValue,
            determination: entry?.determination || null,
            determinationReason: entry?.determinationReason || null,
            readiness: entry?.readiness || null,
            readinessProbe: entry?.readinessProbe || null,
            latestDetermination: entry?.latestDetermination || null,
            recommendations: Array.isArray(entry?.recommendations) ? [...entry.recommendations] : [],
            diffPreview: domainDiff,
            metrics,
            candidateMetrics,
            validationSummary,
            timing,
            error: entry?.error || null
          };
        })
      : [];

    const logs = Array.isArray(logEntries)
      ? logEntries.map((entry) => ({ level: entry.level || 'info', message: entry.message || '' }))
      : [];

    const reportDirectory = options?.reportDirectory
      || (options?.reportPath ? path.dirname(options.reportPath) : null);

    const validationSummary = {
      passed: summary?.validationSucceeded ?? totals.validationSucceeded ?? 0,
      failed: summary?.validationFailed ?? totals.validationFailed ?? 0,
      failureReasons: cloneFailureReasons(summary?.validationFailureReasons)
    };

    const candidateMetrics = deriveCandidateMetrics(totals, summary || {});

    const auditCounts = summary?.auditCounts || null;

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      domain: summary?.domain ?? null,
      run: {
        startedAt: summary?.startedAt || null,
        completedAt: summary?.completedAt || null,
        durationMs: Number.isFinite(summary?.durationMs) ? summary.durationMs : null,
        runId: summary?.runId || null
      },
      batch: {
        totalDomains: summary?.batch?.totalDomains ?? null,
        processedDomains: summary?.batch?.processedDomains ?? null,
        truncatedDecisionCount: summary?.batch?.truncatedDecisionCount ?? 0
      },
      totals,
      diffPreview: diffSnapshot,
      candidateMetrics,
      validationSummary,
      auditCounts,
      unsupportedKinds: Array.isArray(summary?.unsupportedKinds) ? [...summary.unsupportedKinds] : [],
      options: {
        scheme: options?.scheme || 'https',
        kinds: Array.isArray(options?.kinds) ? [...options.kinds] : [],
        limit: options?.limit ?? null,
        patternsPerPlace: options?.patternsPerPlace ?? null,
        apply: Boolean(options?.apply),
        dryRun: Boolean(options?.dryRun),
        maxAgeDays: options?.maxAgeDays ?? null,
        refresh404Days: options?.refresh404Days ?? null,
        retry4xxDays: options?.retry4xxDays ?? null,
        readinessTimeoutSeconds: options?.readinessTimeoutSeconds ?? null,
        domainBatchSize: Array.isArray(options?.domainBatch) ? options.domainBatch.length : null,
        emitReport: Boolean(options?.emitReport),
        reportPath: options?.reportPath || null,
        reportDirectory
      },
      domainInputs: options?.domainInputs || null,
      domainSummaries,
      decisions: Array.isArray(summary?.decisions)
        ? summary.decisions.map((decision) => (decision && typeof decision === 'object' ? { ...decision } : decision))
        : [],
      logs,
      report: {
        requested: Boolean(options?.emitReport),
        targetPath: options?.reportPath || null,
        directory: reportDirectory,
        written: false
      }
    };
  }

  /**
   * Write report file to disk
   * @param {Object} payload - Report payload
   * @param {Object} options - Write options
   * @returns {Object} Result
   */
  static writeReportFile(payload, options = {}) {
    if (!options?.emitReport) {
      return { skipped: true };
    }

    const targetPath = options.reportPath;
    if (!targetPath) {
      return { error: 'Report path could not be resolved. Provide a file or directory to --emit-report.' };
    }

    const targetDir = options.reportDirectory || path.dirname(targetPath);

    try {
      if (targetDir) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    } catch (error) {
      return { error: `Failed to ensure report directory at ${targetDir}: ${error?.message || error}` };
    }

    const savedAt = new Date().toISOString();
    const payloadForWrite = {
      ...payload,
      report: {
        ...(payload.report || {}),
        requested: true,
        targetPath,
        directory: targetDir,
        written: true,
        savedAt
      }
    };

    try {
      fs.writeFileSync(targetPath, `${JSON.stringify(payloadForWrite, null, 2)}\n`, 'utf8');
      return {
        path: targetPath,
        directory: targetDir,
        savedAt,
        payload: payloadForWrite
      };
    } catch (error) {
      return { error: `Failed to write report at ${targetPath}: ${error?.message || error}` };
    }
  }
}

// Constants used by report writing
ReportWriter.DSPL_KIND_PROPERTY_MAP = Object.freeze({
  country: 'countryHubPatterns',
  region: 'regionHubPatterns',
  city: 'cityHubPatterns'
});

ReportWriter.SUMMARY_NUMERIC_FIELDS = [
  'totalPlaces',
  'totalUrls',
  'fetched',
  'cached',
  'skipped',
  'skippedDuplicatePlace',
  'skippedRecent4xx',
  'stored404',
  'insertedHubs',
  'updatedHubs',
  'errors',
  'rateLimited',
  'readinessTimedOut',
  'validationSucceeded',
  'validationFailed'
];

module.exports = { ReportWriter };