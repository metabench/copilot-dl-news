#!/usr/bin/env node
/**
 * URL Classification CLI Tool
 * 
 * Classifies URLs using the decision tree and provides explanation traces.
 * Supports both URL-only classification and Puppeteer-based deep analysis.
 * 
 * Usage:
 *   node tools/dev/url-classify.js <url>                    # Classify single URL
 *   node tools/dev/url-classify.js --sample 100             # Sample from DB
 *   node tools/dev/url-classify.js --deep <url>             # Deep analysis with Puppeteer
 *   node tools/dev/url-classify.js --trace <url>            # Show decision tree path
 *   node tools/dev/url-classify.js --test                   # Run accuracy test
 *   node tools/dev/url-classify.js --unknowns 50            # Analyze unknown classifications
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const flags = {
  sample: null,
  deep: false,
  trace: false,
  test: false,
  unknowns: null,
  host: null,
  json: args.includes('--json'),
  verbose: args.includes('-v') || args.includes('--verbose'),
  help: args.includes('-h') || args.includes('--help'),
};

// Parse flag values
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sample' && args[i + 1]) {
    flags.sample = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--unknowns' && args[i + 1]) {
    flags.unknowns = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--host' && args[i + 1]) {
    flags.host = args[i + 1];
    i++;
  } else if (args[i] === '--deep') {
    flags.deep = true;
  } else if (args[i] === '--trace') {
    flags.trace = true;
  } else if (args[i] === '--test') {
    flags.test = true;
  }
}

// Get URL argument (first non-flag argument)
const urlArg = args.find(a => !a.startsWith('-') && (a.startsWith('http') || a.startsWith('/')));

if (flags.help) {
  console.log(`
URL Classification Tool

Usage:
  node tools/dev/url-classify.js <url>                    # Classify single URL
  node tools/dev/url-classify.js --sample 100             # Sample from DB
  node tools/dev/url-classify.js --sample 100 --host bbc.com  # Sample from specific host
  node tools/dev/url-classify.js --deep <url>             # Deep analysis with Puppeteer
  node tools/dev/url-classify.js --trace <url>            # Show decision tree path
  node tools/dev/url-classify.js --test                   # Run accuracy test
  node tools/dev/url-classify.js --unknowns 50            # Analyze unknown classifications

Options:
  --sample <n>    Sample n URLs from database
  --host <domain> Filter by host domain
  --deep          Use Puppeteer for deep page analysis
  --trace         Show full decision tree trace
  --test          Run accuracy test on sample
  --unknowns <n>  Show n URLs that classify as unknown
  --json          Output as JSON
  -v, --verbose   Verbose output
  -h, --help      Show this help
`);
  process.exit(0);
}

// Load decision tree
const TREE_PATH = path.join(process.cwd(), 'config', 'decision-trees', 'url-classification.json');
let decisionTree;
try {
  decisionTree = JSON.parse(fs.readFileSync(TREE_PATH, 'utf8'));
} catch (e) {
  console.error('Error loading decision tree:', e.message);
  process.exit(1);
}

/**
 * Compute URL signals for classification
 */
function computeUrlSignals(urlStr) {
  try {
    const u = new URL(urlStr);
    const path = u.pathname;
    const segments = path.split('/').filter(Boolean);
    const depth = segments.length;
    const lastSegment = segments[depth - 1] || '';
    
    return {
      url: urlStr,
      host: u.hostname,
      path: path,
      pathDepth: depth,
      segments: segments,
      slug: lastSegment,
      slugLength: lastSegment.length,
      hasPage: u.searchParams.has('page'),
      hasDatePath: /\/\d{4}\/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2})\/\d{1,2}\//i.test(path),
      hasNumericDate: /\/\d{4}\/\d{2}\/\d{2}\//.test(path),
      hasHyphenDate: /\/\d{4}-\d{2}-\d{2}\//.test(path),
      hasHyphenatedSlug: lastSegment.includes('-') && lastSegment.length > 10,
      hasSeriesSegment: path.includes('/series/'),
      hasArticleSegment: /\/article[s]?\//.test(path),
      hasLiveSegment: path.includes('/live/'),
      hasTopicsSegment: /\/topic[s]?\//.test(path),
      hasTagSegment: /\/tag[s]?\//.test(path),
      hasVideoSegment: path.includes('/video/'),
      hasAudioSegment: path.includes('/audio/') || path.includes('/podcast'),
      hasProfileSegment: path.includes('/profile/') || path.includes('/person/'),
      isDateArchive: /\/\d{4}\/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2})\/?$/i.test(path),
      hasQueryParams: u.search.length > 0,
      queryParamCount: Array.from(u.searchParams).length,
      fileExtension: path.match(/\.([a-z0-9]+)$/i)?.[1] || null,
      isMediaFile: /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf)$/i.test(path),
      isFeedFile: /\.(xml|rss|atom|json)$/i.test(path) || path.includes('/feed'),
    };
  } catch (e) {
    return { error: e.message, url: urlStr };
  }
}

/**
 * Evaluate a condition against signals
 */
function evaluateCondition(condition, signals) {
  if (!condition) return { result: false, reason: 'no-condition' };
  
  switch (condition.type) {
    case 'compare': {
      const field = condition.field;
      const operator = condition.operator;
      let value = condition.value;
      let actual = signals[field];
      
      // Handle field references in value
      if (typeof value === 'object' && value.field) {
        value = signals[value.field];
        if (value.multiplier) value *= value.multiplier;
      }
      
      let result;
      switch (operator) {
        case 'eq': result = actual === value; break;
        case 'ne': result = actual !== value; break;
        case 'gt': result = actual > value; break;
        case 'gte': result = actual >= value; break;
        case 'lt': result = actual < value; break;
        case 'lte': result = actual <= value; break;
        case 'contains': result = String(actual).includes(value); break;
        case 'matches': result = new RegExp(value, 'i').test(actual); break;
        default: result = false;
      }
      
      return { 
        result, 
        reason: `${field} (${actual}) ${operator} ${value} = ${result}`,
        field,
        actual,
        expected: value,
        operator
      };
    }
    
    case 'flag': {
      const flag = condition.flag;
      const expected = condition.expected !== false;
      const actual = !!signals[flag];
      const result = actual === expected;
      
      return {
        result,
        reason: `${flag} is ${actual} (expected ${expected}) = ${result}`,
        flag,
        actual,
        expected
      };
    }
    
    case 'url_matches': {
      const patterns = condition.patterns || [];
      const url = signals.url || '';
      const path = signals.path || '';
      const matchType = condition.matchType || 'contains';
      const negate = condition.negate === true;
      
      let matched = false;
      let matchedPattern = null;
      
      for (const pattern of patterns) {
        const isRegex = matchType === 'regex' || (pattern.startsWith('/') && pattern.endsWith('/'));
        
        if (isRegex) {
          // Regex pattern - extract pattern if wrapped in /.../ 
          const regexStr = pattern.startsWith('/') && pattern.endsWith('/') 
            ? pattern.slice(1, -1) 
            : pattern;
          try {
            const regex = new RegExp(regexStr, 'i');
            if (regex.test(url) || regex.test(path)) {
              matched = true;
              matchedPattern = pattern;
              break;
            }
          } catch (e) {
            // Invalid regex, skip
          }
        } else {
          // String contains
          if (url.includes(pattern) || path.includes(pattern)) {
            matched = true;
            matchedPattern = pattern;
            break;
          }
        }
      }
      
      // Handle negation
      const result = negate ? !matched : matched;
      const reason = matched 
        ? (negate ? `matched but negated "${matchedPattern}"` : `matched "${matchedPattern}"`)
        : (negate ? 'no match (negated = pass)' : `no match in ${patterns.length} patterns`);
      
      return { result, reason, pattern: matchedPattern };
    }
    
    case 'compound': {
      const conditions = condition.conditions || [];
      const operator = (condition.operator || 'and').toLowerCase(); // 'and' or 'or'
      
      const results = conditions.map(c => evaluateCondition(c, signals));
      
      if (operator === 'and') {
        const allTrue = results.every(r => r.result);
        return { 
          result: allTrue, 
          reason: `AND of ${results.length} conditions = ${allTrue}`,
          subResults: results
        };
      } else {
        const anyTrue = results.some(r => r.result);
        return {
          result: anyTrue,
          reason: `OR of ${results.length} conditions = ${anyTrue}`,
          subResults: results
        };
      }
    }
    
    default:
      return { result: false, reason: `unknown condition type: ${condition.type}` };
  }
}

/**
 * Walk the decision tree and return classification with trace
 */
function classifyWithTrace(signals, tree) {
  const trace = [];
  let node = tree;
  let depth = 0;
  const maxDepth = 50; // Safety limit
  
  while (node && depth < maxDepth) {
    depth++;
    
    // Result node - we're done
    if (node.result !== undefined) {
      const isMatch = node.result === 'match' || node.result === true;
      trace.push({
        type: 'result',
        id: node.id,
        result: isMatch ? 'match' : 'no-match',
        reason: node.reason || ''
      });
      
      return {
        result: isMatch ? 'match' : 'no-match',
        reason: node.reason,
        trace,
        depth
      };
    }
    
    // Branch node - evaluate condition
    if (node.condition) {
      const evalResult = evaluateCondition(node.condition, signals);
      
      trace.push({
        type: 'branch',
        id: node.id,
        condition: node.condition,
        evaluation: evalResult,
        branch: evalResult.result ? 'yes' : 'no'
      });
      
      node = evalResult.result ? node.yes : node.no;
    } else {
      // No condition, shouldn't happen
      trace.push({ type: 'error', message: 'node has no condition or result' });
      break;
    }
  }
  
  return {
    result: 'unknown',
    reason: 'tree traversal ended without result',
    trace,
    depth
  };
}

/**
 * Classify a URL using the decision tree
 */
function classifyUrl(urlStr) {
  const signals = computeUrlSignals(urlStr);
  if (signals.error) {
    return { classification: 'error', error: signals.error, url: urlStr };
  }
  
  // Try each category tree in order: nav, hub, article
  const categories = ['nav', 'hub', 'article'];
  const traces = {};
  
  for (const category of categories) {
    const catTree = decisionTree.categories[category];
    if (!catTree || !catTree.tree) continue;
    
    const result = classifyWithTrace(signals, catTree.tree);
    traces[category] = result;
    
    if (result.result === 'match') {
      return {
        classification: category,
        confidence: 1.0,
        reason: result.reason,
        signals,
        traces,
        matchedCategory: category
      };
    }
  }
  
  // No match - use fallback
  return {
    classification: decisionTree.fallback || 'unknown',
    confidence: 0.5,
    reason: 'no category matched',
    signals,
    traces
  };
}

/**
 * Format trace for display
 */
function formatTrace(trace, indent = 0) {
  const lines = [];
  const pad = '  '.repeat(indent);
  
  for (const step of trace) {
    if (step.type === 'branch') {
      const arrow = step.branch === 'yes' ? '✓' : '✗';
      lines.push(`${pad}${arrow} [${step.id}] ${step.evaluation.reason}`);
    } else if (step.type === 'result') {
      const icon = step.result === 'match' ? '🎯' : '❌';
      lines.push(`${pad}${icon} RESULT: ${step.result} - ${step.reason}`);
    } else if (step.type === 'error') {
      lines.push(`${pad}⚠️ ERROR: ${step.message}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Deep page analysis using Puppeteer
 */
async function deepAnalyze(urlStr) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(urlStr, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract page structure signals
    const deepSignals = await page.evaluate(() => {
      const body = document.body;
      const articles = document.querySelectorAll('article');
      const mainContent = document.querySelector('main, [role="main"], .content, #content');
      const headlines = document.querySelectorAll('h1, h2, h3');
      const links = document.querySelectorAll('a');
      const paragraphs = document.querySelectorAll('p');
      const images = document.querySelectorAll('img');
      const time = document.querySelector('time, [datetime], .date, .published');
      const author = document.querySelector('[rel="author"], .author, .byline, [itemprop="author"]');
      
      // Get article cards (hub indicator)
      const cards = document.querySelectorAll('[class*="card"], [class*="teaser"], [class*="headline-list"]');
      
      // Get navigation links
      const navLinks = document.querySelectorAll('nav a, [role="navigation"] a');
      
      // Calculate link density
      const bodyText = body.innerText || '';
      const totalTextLength = bodyText.length;
      let linkTextLength = 0;
      links.forEach(a => linkTextLength += (a.innerText || '').length);
      const linkDensity = totalTextLength > 0 ? linkTextLength / totalTextLength : 0;
      
      // Get headline positions
      const headlinePositions = [];
      headlines.forEach(h => {
        const rect = h.getBoundingClientRect();
        headlinePositions.push({
          tag: h.tagName,
          text: h.innerText?.substring(0, 100),
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
      });
      
      return {
        articleCount: articles.length,
        hasMainContent: !!mainContent,
        headlineCount: headlines.length,
        headlinePositions,
        linkCount: links.length,
        paragraphCount: paragraphs.length,
        imageCount: images.length,
        hasTimestamp: !!time,
        timestampText: time?.innerText || time?.getAttribute('datetime') || null,
        hasAuthor: !!author,
        authorText: author?.innerText || null,
        cardCount: cards.length,
        navLinkCount: navLinks.length,
        linkDensity: linkDensity.toFixed(3),
        totalTextLength,
        title: document.title,
        ogType: document.querySelector('meta[property="og:type"]')?.content,
        schemaType: document.querySelector('[itemtype]')?.getAttribute('itemtype')
      };
    });
    
    await browser.close();
    
    // Analyze signals to determine type
    let inferredType = 'unknown';
    const reasons = [];
    
    if (deepSignals.cardCount >= 5) {
      reasons.push(`${deepSignals.cardCount} article cards found`);
      inferredType = 'hub';
    }
    
    if (deepSignals.linkDensity > 0.3 && deepSignals.linkCount > 50) {
      reasons.push(`high link density (${deepSignals.linkDensity})`);
      inferredType = 'hub';
    }
    
    if (deepSignals.articleCount === 1 && deepSignals.hasAuthor && deepSignals.hasTimestamp) {
      reasons.push('single article with author and timestamp');
      inferredType = 'article';
    }
    
    if (deepSignals.paragraphCount > 5 && deepSignals.linkDensity < 0.15) {
      reasons.push(`low link density (${deepSignals.linkDensity}) with ${deepSignals.paragraphCount} paragraphs`);
      inferredType = 'article';
    }
    
    if (deepSignals.ogType === 'article') {
      reasons.push('og:type is article');
      if (inferredType === 'unknown') inferredType = 'article';
    }
    
    return {
      url: urlStr,
      deepSignals,
      inferredType,
      reasons,
      confidence: reasons.length > 1 ? 0.9 : 0.7
    };
    
  } catch (e) {
    if (browser) await browser.close();
    return { url: urlStr, error: e.message };
  }
}

/**
 * Main execution
 */
async function main() {
  // Single URL classification
  if (urlArg) {
    const fullUrl = urlArg.startsWith('http') ? urlArg : `https://example.com${urlArg}`;
    
    if (flags.deep) {
      console.log('🔍 Deep analysis using Puppeteer...\n');
      const deepResult = await deepAnalyze(fullUrl);
      
      if (deepResult.error) {
        console.error('Error:', deepResult.error);
        process.exit(1);
      }
      
      if (flags.json) {
        console.log(JSON.stringify(deepResult, null, 2));
      } else {
        console.log('URL:', deepResult.url);
        console.log('\n📊 Deep Signals:');
        console.log('  Title:', deepResult.deepSignals.title);
        console.log('  Article elements:', deepResult.deepSignals.articleCount);
        console.log('  Card/teaser elements:', deepResult.deepSignals.cardCount);
        console.log('  Paragraphs:', deepResult.deepSignals.paragraphCount);
        console.log('  Links:', deepResult.deepSignals.linkCount);
        console.log('  Link density:', deepResult.deepSignals.linkDensity);
        console.log('  Has author:', deepResult.deepSignals.hasAuthor);
        console.log('  Has timestamp:', deepResult.deepSignals.hasTimestamp);
        console.log('  og:type:', deepResult.deepSignals.ogType);
        console.log('\n🎯 Inferred Type:', deepResult.inferredType);
        console.log('Reasons:', deepResult.reasons.join('; '));
      }
      return;
    }
    
    const result = classifyUrl(fullUrl);
    
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('URL:', fullUrl);
      console.log('Classification:', result.classification);
      console.log('Confidence:', result.confidence);
      console.log('Reason:', result.reason);
      
      if (flags.trace && result.traces) {
        console.log('\n📋 Decision Traces:');
        for (const [cat, trace] of Object.entries(result.traces)) {
          console.log(`\n  [${cat.toUpperCase()}]:`);
          console.log(formatTrace(trace.trace, 2));
        }
      }
      
      if (flags.verbose) {
        console.log('\n📊 URL Signals:');
        for (const [key, value] of Object.entries(result.signals)) {
          if (key !== 'url') {
            console.log(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
    }
    return;
  }
  
  // Sample from database
  if (flags.sample || flags.test || flags.unknowns) {
    const Database = require('better-sqlite3');
    const db = new Database('data/news.db', { readonly: true });
    
    let query = `
      SELECT DISTINCT u.url 
      FROM urls u
      WHERE u.url LIKE 'http%'
    `;
    
    if (flags.host) {
      query += ` AND u.url LIKE '%${flags.host}%'`;
    }
    
    query += ` ORDER BY RANDOM() LIMIT ${flags.sample || flags.unknowns || 1000}`;
    
    const rows = db.prepare(query).all();
    db.close();
    
    const results = { article: [], hub: [], nav: [], unknown: [] };
    const unknownDetails = [];
    
    for (const { url } of rows) {
      const result = classifyUrl(url);
      const cls = result.classification;
      results[cls] = results[cls] || [];
      results[cls].push(url);
      
      if (cls === 'unknown') {
        unknownDetails.push({
          url,
          signals: result.signals,
          reason: result.reason
        });
      }
    }
    
    if (flags.unknowns) {
      console.log(`\n=== Unknown Classifications (${unknownDetails.length}) ===\n`);
      for (const item of unknownDetails.slice(0, flags.unknowns)) {
        console.log('URL:', item.url);
        console.log('  Path:', item.signals.path);
        console.log('  Depth:', item.signals.pathDepth);
        console.log('  Slug:', item.signals.slug, `(${item.signals.slugLength} chars)`);
        console.log('  Has date:', item.signals.hasDatePath || item.signals.hasNumericDate);
        console.log('  Has hyphenated slug:', item.signals.hasHyphenatedSlug);
        console.log('');
      }
    } else {
      console.log('\n=== Classification Results ===');
      console.log(`Total URLs: ${rows.length}`);
      console.log(`  article: ${results.article?.length || 0}`);
      console.log(`  hub: ${results.hub?.length || 0}`);
      console.log(`  nav: ${results.nav?.length || 0}`);
      console.log(`  unknown: ${results.unknown?.length || 0}`);
      
      const unknownPct = ((results.unknown?.length || 0) / rows.length * 100).toFixed(2);
      console.log(`\nUnknown rate: ${unknownPct}%`);
      
      if (results.unknown?.length > 0 && flags.verbose) {
        console.log('\nSample unknowns:');
        results.unknown.slice(0, 10).forEach(u => {
          const path = new URL(u).pathname;
          console.log('  ', path.substring(0, 80));
        });
      }
    }
    
    if (flags.json) {
      console.log(JSON.stringify({
        total: rows.length,
        breakdown: {
          article: results.article?.length || 0,
          hub: results.hub?.length || 0,
          nav: results.nav?.length || 0,
          unknown: results.unknown?.length || 0
        },
        unknownRate: ((results.unknown?.length || 0) / rows.length * 100).toFixed(2) + '%',
        unknownSample: unknownDetails.slice(0, 20)
      }, null, 2));
    }
    
    return;
  }
  
  console.log('No URL or action specified. Use --help for usage.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
