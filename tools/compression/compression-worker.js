#!/usr/bin/env node

/**
 * compression-worker.js - Worker thread for parallel Brotli compression
 *
 * Processes batches of articles for compression in parallel worker threads.
 * Receives articles via parent message, compresses them, and sends results back.
 */

const { parentPort } = require('worker_threads');
const zlib = require('zlib');
const { HtmlArticleExtractor } = require('../src/shared/utils/HtmlArticleExtractor');
const { decompress } = require('../src/shared/utils/CompressionFacade');

// Listen for work from parent thread
parentPort.on('message', (data) => {
  const { workerId, articles, extractionMode, compressionMethod, compressionLevel, windowBits } = data;
  
  // Debug: Log worker activity
  console.log(`[WORKER-${workerId}] Processing batch of ${articles.length} articles`);
  
  const results = [];

  try {
    for (const article of articles) {
      console.log(`[WORKER-${workerId}] Processing article ${article.id} (${article.html ? article.html.length : 0} bytes)`);
      
      try {
        let processedArticle = { ...article };
        
        // Decompress content if it was stored compressed
        if (article.compression_algorithm && article.compression_algorithm !== 'none') {
          try {
            // Ensure html is a Buffer for decompression
            const compressedBuffer = Buffer.isBuffer(article.html) 
              ? article.html 
              : Buffer.from(article.html);
            processedArticle.html = decompress(compressedBuffer, article.compression_algorithm);
            // Convert Buffer to string for HTML processing
            if (Buffer.isBuffer(processedArticle.html)) {
              processedArticle.html = processedArticle.html.toString('utf8');
            }
            console.log(`[WORKER-${workerId}] Decompressed article ${article.id}: ${compressedBuffer.length} -> ${processedArticle.html.length} bytes`);
          } catch (error) {
            console.log(`[WORKER-${workerId}] Failed to decompress article ${article.id}: ${error.message}`);
            // Keep compressed content as fallback
            processedArticle.html = article.html;
          }
        }
        let extractedText = null;
        let wordCount = null;
        let metadata = null;
        let extractionSuccess = false;

        // Perform ArticlePlus extraction if requested
        if (extractionMode === 'article-plus' && processedArticle.html) {
          console.log(`[WORKER-${workerId}] Starting ArticlePlus extraction for article ${article.id}`);
          
          try {
            const extractor = new HtmlArticleExtractor();
            const extractionResult = extractor.extractPlus(processedArticle.html, article.url);
            
            if (extractionResult.success) {
              extractedText = extractionResult.text;
              wordCount = extractionResult.wordCount;
              metadata = JSON.stringify(extractionResult.metadata);
              extractionSuccess = true;
              
              console.log(`[WORKER-${workerId}] ArticlePlus extraction successful: ${wordCount} words`);
              
              // Use extracted text for compression instead of raw HTML
              processedArticle.html = extractedText;
            } else {
              console.log(`[WORKER-${workerId}] ArticlePlus extraction failed: ${extractionResult.error}`);
              // Fall back to raw HTML
              extractionSuccess = false;
            }
          } catch (error) {
            console.log(`[WORKER-${workerId}] ArticlePlus extraction error: ${error.message}`);
            extractionSuccess = false;
          }
        }

        // Perform compression if requested
        const originalSize = processedArticle.html ? processedArticle.html.length : 0;
        let compressedHtml = null;
        let compressedSize = null;
        let compressionRatio = null;

        if (processedArticle.html && originalSize > 0 && compressionMethod !== 'none') {
          console.log(`[WORKER-${workerId}] Starting ${compressionMethod} compression for article ${article.id}`);
          
          if (compressionMethod === 'gzip') {
            compressedHtml = zlib.gzipSync(processedArticle.html, { level: compressionLevel });
          } else if (compressionMethod === 'brotli') {
            // Support super-large window sizes (up to 30 bits = 1GB window)
            const options = {
              level: compressionLevel,
              windowBits: windowBits || 24
            };
            console.log(`[WORKER-${workerId}] Brotli options: level=${options.level}, windowBits=${options.windowBits}`);
            compressedHtml = zlib.brotliCompressSync(processedArticle.html, options);
          }

          if (compressedHtml) {
            compressedSize = compressedHtml.length;
            compressionRatio = originalSize / compressedSize;
            console.log(`[WORKER-${workerId}] Article ${article.id} compressed: ${originalSize} -> ${compressedSize} bytes (ratio: ${compressionRatio.toFixed(2)})`);
          }
        }

        results.push({
          id: article.id,
          url: article.url,
          canonical_url: article.canonical_url,
          host: article.host,
          title: article.title,
          date: article.date,
          section: article.section,
          html: article.html, // Keep original HTML for reference
          crawled_at: article.crawled_at,
          extractedText,
          wordCount,
          metadata,
          extractionSuccess: extractionSuccess ? 1 : 0, // Convert boolean to integer for SQLite
          success: true,
          compressedHtml,
          originalSize,
          compressedSize,
          compressionRatio
        });

      } catch (error) {
        console.log(`[WORKER-${workerId}] Failed to process article ${article.id}: ${error.message}`);
        results.push({
          id: article.id,
          url: article.url,
          canonical_url: article.canonical_url,
          host: article.host,
          title: article.title,
          date: article.date,
          section: article.section,
          html: article.html,
          crawled_at: article.crawled_at,
          extractedText: null,
          wordCount: null,
          metadata: null,
          extractionSuccess: 0, // Convert boolean to integer for SQLite
          success: false,
          error: error.message,
          originalSize: article.html ? article.html.length : 0
        });
      }
    }

    console.log(`[WORKER-${workerId}] Batch completed, sending ${results.length} results`);
    // Send results back to parent
    parentPort.postMessage({ success: true, results });

  } catch (error) {
    console.log(`[WORKER-${workerId}] Fatal error: ${error.message}`);
    // Send error back to parent
    parentPort.postMessage({ success: false, error: error.message });
  }
});

// Handle worker termination
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});