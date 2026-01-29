'use strict';

const { UrlFact } = require('./UrlFact');

/**
 * HasDateSegment - Detects date patterns in URL paths
 * 
 * Fact: url.hasDateSegment
 * 
 * Detects common date URL patterns:
 * - /2024/01/15/ (most common news pattern)
 * - /2024/jan/15/ (month name variant - The Guardian, etc.)
 * - /2024-01-15/ (hyphenated variant)
 * - /20240115/ (compact 8-digit)
 * - /2024/01/ (year/month only)
 * 
 * This is one of the strongest URL-only signals for article detection.
 * Most news sites include publication date in article URLs.
 * 
 * Evidence includes parsed date components when matched.
 * 
 * @example
 * const fact = new HasDateSegment();
 * fact.extract('https://example.com/news/2024/01/15/story-slug');
 * // => { name: 'url.hasDateSegment', value: true, evidence: { pattern: '/2024/01/15/', year: '2024', month: '01', day: '15' } }
 */
class HasDateSegment extends UrlFact {
  constructor() {
    super({
      name: 'url.hasDateSegment',
      description: 'URL path contains a recognizable date pattern'
    });
    
    /**
     * Month name to number mapping (lowercase)
     * @private
     */
    this.monthNames = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12'
    };
    
    /**
     * Date patterns to check, in order of specificity
     * @private
     */
    this.patterns = [
      // /2024/01/15/ - most specific, slash-separated YYYY/MM/DD
      {
        regex: /\/(\d{4})\/(\d{2})\/(\d{2})\//,
        extract: (m) => ({ year: m[1], month: m[2], day: m[3], format: 'YYYY/MM/DD' })
      },
      // /2024/jan/15/ - month name variant (The Guardian, etc.)
      {
        regex: /\/(\d{4})\/([a-z]{3,9})\/(\d{2})\//i,
        extract: (m, self) => {
          const monthNum = self.monthNames[m[2].toLowerCase()];
          return monthNum 
            ? { year: m[1], month: monthNum, day: m[3], format: 'YYYY/mon/DD', monthName: m[2].toLowerCase() }
            : null;
        }
      },
      // /2024-01-15/ or /2024-01-15 - hyphenated
      {
        regex: /\/(\d{4})-(\d{2})-(\d{2})(?:\/|$)/,
        extract: (m) => ({ year: m[1], month: m[2], day: m[3], format: 'YYYY-MM-DD' })
      },
      // /20240115/ - compact 8-digit
      {
        regex: /\/(\d{4})(\d{2})(\d{2})(?:\/|$)/,
        extract: (m) => ({ year: m[1], month: m[2], day: m[3], format: 'YYYYMMDD' })
      },
      // /2024/01/ - year/month only (less specific, still useful)
      {
        regex: /\/(\d{4})\/(\d{2})\//,
        extract: (m) => ({ year: m[1], month: m[2], day: null, format: 'YYYY/MM' })
      },
      // /2024/jan/ - year/month name only
      {
        regex: /\/(\d{4})\/([a-z]{3,9})\//i,
        extract: (m, self) => {
          const monthNum = self.monthNames[m[2].toLowerCase()];
          return monthNum 
            ? { year: m[1], month: monthNum, day: null, format: 'YYYY/mon', monthName: m[2].toLowerCase() }
            : null;
        }
      }
    ];
  }
  
  /**
   * Extract the date segment fact
   * 
   * @param {string|URL|Object} input - URL to analyze
   * @returns {FactResult}
   */
  extract(input) {
    const url = this.parseUrl(input);
    
    for (const { regex, extract } of this.patterns) {
      const match = url.pathname.match(regex);
      if (match) {
        const components = extract(match, this);
        
        // Skip if extract returned null (e.g., invalid month name)
        if (!components) continue;
        
        // Validate month and day are reasonable
        const month = parseInt(components.month, 10);
        const day = components.day ? parseInt(components.day, 10) : null;
        
        if (month >= 1 && month <= 12 && (day === null || (day >= 1 && day <= 31))) {
          return this.createFact(true, {
            pattern: match[0],
            ...components
          });
        }
      }
    }
    
    return this.createFact(false, { reason: 'No date pattern found in URL path' });
  }
}

module.exports = { HasDateSegment };
