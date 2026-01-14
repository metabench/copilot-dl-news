#!/usr/bin/env node

/**
 * sample-place-matching.js - Dry run place matching on 20 randomly sampled articles
 *
 * Usage: node sample-place-matching.js
 */

const { ensureDatabase } = require('../src/data/db/sqlite/v1');
const { ArticlePlaceMatcher } = require('../src/intelligence/matching/ArticlePlaceMatcher');

// Simple HTML text extraction (strips tags and normalizes whitespace)
function extractTextFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  // Remove script and style blocks completely
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove all HTML tags
  html = html.replace(/<[^>]+>/g, ' ');
  
  // Decode common HTML entities
  html = html.replace(/&nbsp;/g, ' ');
  html = html.replace(/&amp;/g, '&');
  html = html.replace(/&lt;/g, '<');
  html = html.replace(/&gt;/g, '>');
  html = html.replace(/&quot;/g, '"');
  html = html.replace(/&#39;/g, "'");
  
  // Normalize whitespace and trim
  html = html.replace(/\s+/g, ' ').trim();
  
  return html;
}

async function main() {
  console.log('🔍 Sampling 20 random articles for place matching...\n');

  const db = ensureDatabase('./data/news.db');

  // Get 20 random articles with content
  const articles = db.prepare(`
    SELECT
      hr.id,
      hr.url_id,
      u.url,
      cs.content_blob,
      cs.uncompressed_size
    FROM http_responses hr
    JOIN content_storage cs ON hr.id = cs.http_response_id
    JOIN urls u ON hr.url_id = u.id
    WHERE cs.uncompressed_size > 1000
    ORDER BY RANDOM()
    LIMIT 20
  `).all();

  console.log(`📊 Found ${articles.length} articles to analyze\n`);

  // Initialize place matcher with mock gazetteer for testing
  const matcher = new ArticlePlaceMatcher({
    db,
    textSampleLimit: 512, // Limit text processing to 512 chars for dry run
    gazetteerApi: {
      baseUrl: 'http://localhost:3000',
      // Mock places data for testing
      mockPlaces: [
        { id: 1, canonicalName: 'London', names: [{ name: 'London' }, { name: 'Greater London' }] },
        { id: 2, canonicalName: 'England', names: [{ name: 'England' }, { name: 'UK' }, { name: 'United Kingdom' }] },
        { id: 3, canonicalName: 'Paris', names: [{ name: 'Paris' }, { name: 'Paris, France' }] },
        { id: 4, canonicalName: 'New York', names: [{ name: 'New York' }, { name: 'NYC' }, { name: 'New York City' }] },
        { id: 5, canonicalName: 'Berlin', names: [{ name: 'Berlin' }, { name: 'Berlin, Germany' }] },
        { id: 6, canonicalName: 'Tokyo', names: [{ name: 'Tokyo' }, { name: 'Tokyo, Japan' }] },
        { id: 7, canonicalName: 'Sydney', names: [{ name: 'Sydney' }, { name: 'Sydney, Australia' }] },
        { id: 8, canonicalName: 'Moscow', names: [{ name: 'Moscow' }, { name: 'Moscow, Russia' }] },
        { id: 9, canonicalName: 'Beijing', names: [{ name: 'Beijing' }, { name: 'Peking' }] },
        { id: 10, canonicalName: 'Rome', names: [{ name: 'Rome' }, { name: 'Rome, Italy' }] }
      ]
    }
  });

  let totalMatches = 0;
  let articlesWithMatches = 0;
  const placeCounts = new Map();

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const htmlContent = article.content_blob.toString('utf8');
    const extractedText = extractTextFromHtml(htmlContent);

    // Show concise article info
    const url = new URL(article.url);
    const domain = url.hostname;
    console.log(`📄 Article ${i + 1}: ${domain}${url.pathname}`);
    console.log(`   Size: ${htmlContent.length} chars`);

    // Show tiny text sample (first 512 chars of extracted text only)
    const textSample = extractedText.substring(0, 512).replace(/\s+/g, ' ').trim();
    console.log(`   Text: "${textSample}${extractedText.length > 512 ? '…' : ''}"`);

    try {
      const matches = await matcher.matchArticleToPlaces(article.id, 1);

      if (matches.length > 0) {
        articlesWithMatches++;
        totalMatches += matches.length;

        // Count places by name
        matches.forEach(match => {
          const placeName = match.place_name || `Place ${match.place_id}`;
          placeCounts.set(placeName, (placeCounts.get(placeName) || 0) + 1);
        });

        // Show concise result
        const topPlaces = matches.slice(0, 3).map(m =>
          `${m.place_name || `ID:${m.place_id}`}(c:${m.confidence.toFixed(2)})`
        ).join(', ');

        console.log(`   ✅ ${matches.length} places: ${topPlaces}`);
      } else {
        console.log(`   ❌ No places found`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log(''); // Blank line between articles
  }

  console.log(`📈 SUMMARY:`);
  console.log(`   Articles analyzed: ${articles.length}`);
  console.log(`   Articles with matches: ${articlesWithMatches} (${((articlesWithMatches/articles.length)*100).toFixed(1)}%)`);
  console.log(`   Total place matches: ${totalMatches}`);
  console.log(`   Average matches per article: ${(totalMatches/articles.length).toFixed(1)}`);

  if (placeCounts.size > 0) {
    console.log(`\n🏆 TOP PLACES:`);
    const sortedPlaces = Array.from(placeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedPlaces.forEach(([place, count]) => {
      console.log(`   ${place}: ${count} mentions`);
    });
  }

  console.log(`\n✅ Place matching dry run complete`);
}

main().catch(console.error);