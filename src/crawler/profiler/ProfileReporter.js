'use strict';

/**
 * ProfileReporter — Generates human-readable and machine-readable reports
 * 
 * Produces ASCII timeline visualizations, summary tables, and JSON exports
 * from profile and bottleneck data.
 * 
 * @module ProfileReporter
 */

/**
 * @typedef {Object} ReportOptions
 * @property {'ascii'|'json'|'markdown'} [format='ascii'] - Output format
 * @property {number} [barWidth=40] - Width of timeline bars
 * @property {boolean} [includeRecommendations=true] - Include recommendations
 * @property {boolean} [includeStatistics=true] - Include detailed stats
 */

class ProfileReporter {
  /**
   * @param {Object} [options]
   * @param {number} [options.barWidth=40] - Default bar width
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor(options = {}) {
    this.barWidth = options.barWidth || 40;
    this.logger = options.logger || console;
  }

  /**
   * Generate a report from a single profile
   * 
   * @param {Object} profile - Profile from CrawlProfiler
   * @param {ReportOptions} [options]
   * @returns {string}
   */
  reportProfile(profile, options = {}) {
    const format = options.format || 'ascii';
    
    switch (format) {
      case 'json':
        return JSON.stringify(profile, null, 2);
      case 'markdown':
        return this._profileToMarkdown(profile, options);
      case 'ascii':
      default:
        return this._profileToAscii(profile, options);
    }
  }

  /**
   * Generate a report from bottleneck detection results
   * 
   * @param {Object} detection - Detection result from BottleneckDetector
   * @param {ReportOptions} [options]
   * @returns {string}
   */
  reportBottlenecks(detection, options = {}) {
    const format = options.format || 'ascii';
    
    switch (format) {
      case 'json':
        return JSON.stringify(detection, null, 2);
      case 'markdown':
        return this._bottlenecksToMarkdown(detection, options);
      case 'ascii':
      default:
        return this._bottlenecksToAscii(detection, options);
    }
  }

  /**
   * Generate combined profile and bottleneck report
   * 
   * @param {Object} profile - Profile from CrawlProfiler
   * @param {Object} detection - Detection from BottleneckDetector
   * @param {ReportOptions} [options]
   * @returns {string}
   */
  reportFull(profile, detection, options = {}) {
    const format = options.format || 'ascii';
    
    switch (format) {
      case 'json':
        return JSON.stringify({ profile, detection }, null, 2);
      case 'markdown':
        return this._fullToMarkdown(profile, detection, options);
      case 'ascii':
      default:
        return this._fullToAscii(profile, detection, options);
    }
  }

  // ─── ASCII Formatters ──────────────────────────────────────────────

  /**
   * @private
   */
  _profileToAscii(profile, options = {}) {
    const barWidth = options.barWidth || this.barWidth;
    const lines = [];
    
    lines.push('CRAWL TIMELINE');
    lines.push('═'.repeat(barWidth + 20));
    lines.push('');
    
    const phases = profile.phases || {};
    const total = profile.total || Object.values(phases).reduce((s, v) => s + v, 0);
    
    if (total === 0) {
      lines.push('No timing data recorded');
      return lines.join('\n');
    }
    
    // Sort phases by typical execution order
    const phaseOrder = ['dns', 'tcp', 'tls', 'firstByte', 'download', 'parseHtml', 'extract', 'dbWrite'];
    const sortedPhases = Object.entries(phases).sort((a, b) => {
      const aIdx = phaseOrder.indexOf(a[0]);
      const bIdx = phaseOrder.indexOf(b[0]);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
    
    // Find longest phase name for alignment
    const maxNameLen = Math.max(...sortedPhases.map(([name]) => name.length));
    
    for (const [phase, duration] of sortedPhases) {
      const pct = (duration / total) * 100;
      const filledBars = Math.round((pct / 100) * barWidth);
      const bar = '▓'.repeat(filledBars) + '░'.repeat(barWidth - filledBars);
      const phaseName = phase.padEnd(maxNameLen);
      const durationStr = `${Math.round(duration)}ms`.padStart(7);
      
      lines.push(` ${phaseName} ${bar} ${durationStr}`);
    }
    
    lines.push(''.padStart(maxNameLen + 1) + ' '.repeat(barWidth) + '────────');
    lines.push(''.padStart(maxNameLen + 1) + ' '.repeat(barWidth) + `${Math.round(total)}ms total`);
    
    if (profile.bottleneck) {
      lines.push('');
      lines.push(`Bottleneck: ${profile.bottleneck}`);
    }
    
    return lines.join('\n');
  }

  /**
   * @private
   */
  _bottlenecksToAscii(detection, options = {}) {
    const lines = [];
    
    lines.push('BOTTLENECK ANALYSIS');
    lines.push('═'.repeat(60));
    lines.push('');
    
    // Health score
    const health = detection.healthScore || {};
    const healthBar = this._healthBar(health.score || 0);
    lines.push(`Health Score: ${healthBar} ${health.score || 0}/100 (${health.status || 'unknown'})`);
    lines.push(`Samples: ${detection.totalSamples}, Avg Total: ${Math.round(detection.avgTotalTime || 0)}ms`);
    lines.push('');
    
    // Bottlenecks
    if (detection.bottlenecks && detection.bottlenecks.length > 0) {
      lines.push('Detected Bottlenecks:');
      lines.push('─'.repeat(60));
      
      for (const b of detection.bottlenecks) {
        const icon = this._severityIcon(b.severity);
        lines.push(`${icon} [${b.severity.toUpperCase()}] ${b.phase} (score: ${b.score})`);
        lines.push(`   Reason: ${b.reason}`);
        
        if (options.includeRecommendations !== false && b.recommendations) {
          lines.push('   Recommendations:');
          for (const rec of b.recommendations.slice(0, 2)) {
            lines.push(`     • ${rec}`);
          }
        }
        lines.push('');
      }
    } else {
      lines.push('✓ No significant bottlenecks detected');
    }
    
    // Phase statistics
    if (options.includeStatistics !== false && detection.analysis) {
      lines.push('');
      lines.push('Phase Statistics:');
      lines.push('─'.repeat(60));
      lines.push('Phase'.padEnd(12) + 'Avg'.padStart(8) + 'P50'.padStart(8) + 'P95'.padStart(8) + 'P99'.padStart(8) + '%Total'.padStart(8));
      
      for (const [phase, stats] of Object.entries(detection.analysis)) {
        lines.push(
          phase.padEnd(12) +
          `${Math.round(stats.avgDuration)}ms`.padStart(8) +
          `${Math.round(stats.p50)}ms`.padStart(8) +
          `${Math.round(stats.p95)}ms`.padStart(8) +
          `${Math.round(stats.p99)}ms`.padStart(8) +
          `${stats.percentOfTotal.toFixed(1)}%`.padStart(8)
        );
      }
    }
    
    return lines.join('\n');
  }

  /**
   * @private
   */
  _fullToAscii(profile, detection, options = {}) {
    return [
      this._profileToAscii(profile, options),
      '',
      this._bottlenecksToAscii(detection, options)
    ].join('\n');
  }

  // ─── Markdown Formatters ───────────────────────────────────────────

  /**
   * @private
   */
  _profileToMarkdown(profile, options = {}) {
    const lines = [];
    
    lines.push('## Crawl Profile');
    lines.push('');
    
    if (profile.metadata?.crawlId) {
      lines.push(`**Crawl ID:** ${profile.metadata.crawlId}`);
    }
    lines.push(`**Timestamp:** ${profile.metadata?.timestamp || new Date().toISOString()}`);
    lines.push(`**Total Duration:** ${Math.round(profile.total || 0)}ms`);
    lines.push('');
    
    lines.push('### Phase Breakdown');
    lines.push('');
    lines.push('| Phase | Duration | % of Total |');
    lines.push('|-------|----------|------------|');
    
    const total = profile.total || 1;
    for (const [phase, duration] of Object.entries(profile.phases || {})) {
      const pct = ((duration / total) * 100).toFixed(1);
      lines.push(`| ${phase} | ${Math.round(duration)}ms | ${pct}% |`);
    }
    
    if (profile.bottleneck) {
      lines.push('');
      lines.push(`**Bottleneck:** \`${profile.bottleneck}\``);
    }
    
    return lines.join('\n');
  }

  /**
   * @private
   */
  _bottlenecksToMarkdown(detection, options = {}) {
    const lines = [];
    
    lines.push('## Bottleneck Analysis');
    lines.push('');
    
    const health = detection.healthScore || {};
    lines.push(`**Health Score:** ${health.score || 0}/100 (${health.status || 'unknown'})`);
    lines.push(`**Samples Analyzed:** ${detection.totalSamples}`);
    lines.push(`**Average Total Time:** ${Math.round(detection.avgTotalTime || 0)}ms`);
    lines.push('');
    
    if (detection.bottlenecks && detection.bottlenecks.length > 0) {
      lines.push('### Detected Issues');
      lines.push('');
      
      for (const b of detection.bottlenecks) {
        const emoji = b.severity === 'critical' ? '🔴' : b.severity === 'high' ? '🟠' : b.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`#### ${emoji} ${b.phase} (${b.severity})`);
        lines.push('');
        lines.push(`**Score:** ${b.score}/100`);
        lines.push('');
        lines.push(`**Reason:** ${b.reason}`);
        lines.push('');
        
        if (options.includeRecommendations !== false && b.recommendations) {
          lines.push('**Recommendations:**');
          for (const rec of b.recommendations) {
            lines.push(`- ${rec}`);
          }
        }
        lines.push('');
      }
    } else {
      lines.push('✅ No significant bottlenecks detected');
    }
    
    if (options.includeStatistics !== false && detection.analysis) {
      lines.push('### Detailed Statistics');
      lines.push('');
      lines.push('| Phase | Avg | P50 | P95 | P99 | % Total | Samples |');
      lines.push('|-------|-----|-----|-----|-----|---------|---------|');
      
      for (const [phase, stats] of Object.entries(detection.analysis)) {
        lines.push(
          `| ${phase} | ${Math.round(stats.avgDuration)}ms | ${Math.round(stats.p50)}ms | ` +
          `${Math.round(stats.p95)}ms | ${Math.round(stats.p99)}ms | ${stats.percentOfTotal.toFixed(1)}% | ${stats.sampleCount} |`
        );
      }
    }
    
    return lines.join('\n');
  }

  /**
   * @private
   */
  _fullToMarkdown(profile, detection, options = {}) {
    return [
      '# Crawl Performance Report',
      '',
      this._profileToMarkdown(profile, options),
      '',
      this._bottlenecksToMarkdown(detection, options)
    ].join('\n');
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  /**
   * @private
   */
  _healthBar(score) {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    const color = score >= 80 ? '█' : score >= 60 ? '▓' : '░';
    return '[' + color.repeat(filled) + '░'.repeat(empty) + ']';
  }

  /**
   * @private
   */
  _severityIcon(severity) {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * Generate a compact one-line summary
   * 
   * @param {Object} profile - Profile result
   * @returns {string}
   */
  summarize(profile) {
    const total = Math.round(profile.total || 0);
    const phaseCount = Object.keys(profile.phases || {}).length;
    const bottleneck = profile.bottleneck || 'none';
    return `${total}ms total, ${phaseCount} phases, bottleneck: ${bottleneck}`;
  }

  /**
   * Generate timing comparison between profiles
   * 
   * @param {Object} baseline - Baseline profile
   * @param {Object} current - Current profile
   * @returns {string}
   */
  compareProfiles(baseline, current) {
    const lines = [];
    lines.push('PROFILE COMPARISON');
    lines.push('═'.repeat(50));
    lines.push('');
    
    const baseTotal = baseline.total || 0;
    const currTotal = current.total || 0;
    const diff = currTotal - baseTotal;
    const pct = baseTotal > 0 ? ((diff / baseTotal) * 100).toFixed(1) : 'N/A';
    const direction = diff > 0 ? '↑ slower' : diff < 0 ? '↓ faster' : '= same';
    
    lines.push(`Total: ${Math.round(baseTotal)}ms → ${Math.round(currTotal)}ms (${pct}% ${direction})`);
    lines.push('');
    
    const allPhases = new Set([
      ...Object.keys(baseline.phases || {}),
      ...Object.keys(current.phases || {})
    ]);
    
    lines.push('Phase'.padEnd(12) + 'Baseline'.padStart(10) + 'Current'.padStart(10) + 'Change'.padStart(12));
    lines.push('─'.repeat(44));
    
    for (const phase of allPhases) {
      const base = baseline.phases?.[phase] || 0;
      const curr = current.phases?.[phase] || 0;
      const change = curr - base;
      const changeStr = change > 0 ? `+${Math.round(change)}ms` : `${Math.round(change)}ms`;
      
      lines.push(
        phase.padEnd(12) +
        `${Math.round(base)}ms`.padStart(10) +
        `${Math.round(curr)}ms`.padStart(10) +
        changeStr.padStart(12)
      );
    }
    
    return lines.join('\n');
  }
}

module.exports = { ProfileReporter };
