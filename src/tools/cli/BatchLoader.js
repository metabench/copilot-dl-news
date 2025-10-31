/**
 * BatchLoader - Domain batch loading utilities for CLI tools
 *
 * Handles loading domains from various sources: CLI flags, CSV files,
 * environment variables, and constructing domain batches for processing.
 */

const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../../utils/project-root');

class BatchLoader {
  /**
   * Parse a CSV value into an array of trimmed strings
   * @param {string} value - CSV value to parse
   * @returns {string[]} Array of parsed values
   */
  static parseCsv(value) {
    if (!value) return [];
    return String(value)
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Collect flag values from argv array
   * @param {string[]} argv - Argument array
   * @param {string} flag - Flag to collect (e.g., '--domains')
   * @returns {string[]} Collected values
   */
  static collectFlagValues(argv, flag) {
    if (!Array.isArray(argv) || argv.length === 0 || !flag) {
      return [];
    }

    const results = [];
    const flagWithEquals = `${flag}=`;

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      if (token === flag) {
        const next = argv[index + 1];
        if (typeof next === 'string' && !next.startsWith('-')) {
          results.push(next);
          index += 1;
        }
        continue;
      }

      if (token.startsWith(flagWithEquals)) {
        const value = token.slice(flagWithEquals.length);
        if (value) {
          results.push(value);
        }
      }
    }

    return results;
  }

  /**
   * Split a CSV line handling quoted values
   * @param {string} line - CSV line to split
   * @returns {string[]} Parsed fields
   */
  static splitCsvLine(line) {
    if (typeof line !== 'string' || line.length === 0) {
      return [];
    }

    const segments = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];

      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        segments.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    segments.push(current.trim());
    return segments.map((segment) => segment.trim());
  }

  /**
   * Parse domain import file (CSV format)
   * @param {string} importPath - Path to CSV file
   * @returns {Array} Parsed domain entries
   */
  static parseDomainImportFile(importPath) {
    if (!importPath) {
      return [];
    }

    const resolvedPath = path.isAbsolute(importPath)
      ? importPath
      : path.join(process.cwd(), importPath);

    let contents;
    try {
      contents = fs.readFileSync(resolvedPath, 'utf8');
    } catch (error) {
      throw Object.assign(new Error(`Failed to read domain import file at ${resolvedPath}: ${error.message || error}`), {
        cause: error
      });
    }

    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    if (!lines.length) {
      return [];
    }

    const headerFields = this.splitCsvLine(lines[0]).map((field) => field.toLowerCase());
    const hasHeader = headerFields.includes('domain');
    const headers = hasHeader ? headerFields : null;
    const startIndex = hasHeader ? 1 : 0;

    const resolveField = (fields, name, fallbackIndex) => {
      if (headers) {
        const headerIndex = headers.indexOf(name);
        if (headerIndex !== -1 && fields[headerIndex] != null) {
          return fields[headerIndex].trim();
        }
      }
      if (typeof fallbackIndex === 'number' && fallbackIndex < fields.length) {
        return fields[fallbackIndex].trim();
      }
      return '';
    };

    const entries = [];

    for (let idx = startIndex; idx < lines.length; idx += 1) {
      const line = lines[idx];
      if (!line) continue;
      const fields = this.splitCsvLine(line);
      if (!fields.length) continue;

      const domainValue = resolveField(fields, 'domain', 0);
      if (!domainValue) continue;

      const kindsValue = resolveField(fields, 'kinds', 1);
      const limitValue = resolveField(fields, 'limit', 2);

      let kinds = this.parseCsv(kindsValue);
      if (!kinds.length) {
        kinds = null;
      }

      const parsedLimit = Number.parseInt(limitValue, 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

      entries.push({
        domain: domainValue,
        kinds,
        limit,
        raw: line,
        rowNumber: idx + 1,
        source: resolvedPath
      });
    }

    return entries;
  }

  /**
   * Build domain batch inputs from various sources
   * @param {Object} options - Batch input options
   * @returns {Array} Domain batch entries
   */
  static buildDomainBatchInputs({
    repeatedDomains = [],
    positionalDomains = [],
    csvDomains = [],
    importedDomains = [],
    envDomain = null,
    defaultKinds = [],
    defaultLimit = null,
    scheme = 'https'
  }) {
    const entryMap = new Map();
    const order = [];

    const upsert = (rawValue, origin, overrides = {}) => {
      if (!rawValue) return;
      const trimmed = String(rawValue).trim();
      if (!trimmed) return;

      const normalized = this.constructor.normalizeDomain(trimmed, scheme);
      const host = normalized?.host || trimmed.toLowerCase();
      if (!host) return;

      const sourceTag = origin || 'unknown';
      const kindsOverride = Array.isArray(overrides.kinds) && overrides.kinds.length ? overrides.kinds : null;
      const limitOverride = Number.isFinite(overrides.limit) ? overrides.limit : null;

      if (entryMap.has(host)) {
        const existing = entryMap.get(host);
        existing.sources.add(sourceTag);
        if (!existing.raw) existing.raw = trimmed;
        if (normalized?.scheme && !existing.schemeFromInput) {
          existing.schemeFromInput = normalized.scheme;
        }
        if (kindsOverride) {
          existing.kinds = kindsOverride;
        }
        if (limitOverride != null) {
          existing.limit = limitOverride;
        }
        return;
      }

      entryMap.set(host, {
        raw: trimmed,
        domain: host,
        schemeFromInput: normalized?.scheme || null,
        sources: new Set([sourceTag]),
        kinds: kindsOverride,
        limit: limitOverride
      });
      order.push(host);
    };

    for (const value of repeatedDomains) {
      upsert(value, '--domain');
    }

    for (const value of positionalDomains) {
      upsert(value, 'positional');
    }

    for (const value of csvDomains) {
      upsert(value, '--domains');
    }

    for (const item of importedDomains) {
      if (!item) continue;
      upsert(item.domain, '--import', { kinds: item.kinds || null, limit: item.limit ?? null });
    }

    if (!entryMap.size && envDomain) {
      upsert(envDomain, 'env');
    }

    return order.map((host) => {
      const entry = entryMap.get(host);
      const resolvedKinds = entry.kinds && entry.kinds.length ? entry.kinds : defaultKinds;
      const effectiveKinds = Array.isArray(resolvedKinds) ? [...resolvedKinds] : [];
      const effectiveLimit = entry.limit != null ? entry.limit : defaultLimit;
      const selectedScheme = entry.schemeFromInput || scheme;

      return {
        raw: entry.raw,
        domain: host,
        scheme: selectedScheme,
        base: `${selectedScheme}://${host}`,
        kinds: effectiveKinds,
        kindsOverride: entry.kinds || null,
        limit: effectiveLimit,
        limitOverride: entry.limit,
        sources: Array.from(entry.sources)
      };
    });
  }

  /**
   * Resolve report output path and directory
   * @param {Object} options - Report output options
   * @returns {Object} Resolved paths
   */
  static resolveReportOutput({ requested = false, explicitPath = null, reportDir = null }) {
    if (!requested) {
      return {
        requested: false,
        path: null,
        directory: null
      };
    }

    const projectRoot = findProjectRoot(__dirname);
    const cwd = process.cwd();
    const normalizedReportDir = reportDir && typeof reportDir === 'string' && reportDir.trim().length
      ? (path.isAbsolute(reportDir) ? reportDir.trim() : path.resolve(cwd, reportDir.trim()))
      : path.join(projectRoot, 'place-hub-reports');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFile = `guess-place-hubs-${timestamp}.json`;

    let targetDir = normalizedReportDir;
    let targetPath = null;

    const resolveCandidate = (candidate) => {
      if (!candidate || typeof candidate !== 'string') {
        return null;
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        return null;
      }
      return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
    };

    const explicitResolved = resolveCandidate(explicitPath);

    if (explicitResolved) {
      let stats = null;
      try {
        stats = fs.statSync(explicitResolved);
      } catch (_) {
        stats = null;
      }

      if (stats?.isDirectory?.()) {
        targetDir = explicitResolved;
      } else if (stats?.isFile?.()) {
        targetDir = path.dirname(explicitResolved);
        targetPath = explicitResolved;
      } else {
        const endsWithSep = /[\\/]+$/.test(explicitResolved);
        if (endsWithSep) {
          targetDir = explicitResolved.replace(/[\\/]+$/, '') || normalizedReportDir;
        } else {
          const ext = path.extname(explicitResolved);
          if (ext) {
            targetDir = path.dirname(explicitResolved);
            targetPath = explicitResolved;
          } else {
            targetDir = explicitResolved;
          }
        }
      }
    }

    if (!targetDir) {
      targetDir = normalizedReportDir;
    }

    if (!targetPath) {
      targetPath = path.join(targetDir, defaultFile);
    }

    return {
      requested: true,
      path: targetPath,
      directory: targetDir
    };
  }

  /**
   * Normalize domain input (internal utility)
   * @param {string} input - Domain input
   * @param {string} scheme - Default scheme
   * @returns {Object|null} Normalized domain info
   */
  static normalizeDomain(input, scheme = 'https') {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (!trimmed) return null;
    if (trimmed.includes('://')) {
      const parsed = new URL(trimmed);
      return {
        host: parsed.hostname.toLowerCase(),
        scheme: parsed.protocol.replace(':', ''),
        base: `${parsed.protocol}//${parsed.host}`
      };
    }
    const cleanScheme = scheme === 'http' ? 'http' : 'https';
    return {
      host: trimmed.toLowerCase(),
      scheme: cleanScheme,
      base: `${cleanScheme}://${trimmed.toLowerCase()}`
    };
  }
}

module.exports = { BatchLoader };