#!/usr/bin/env node

/**
 * compression-benchmark-worker.js - Worker thread for compression benchmarking
 */

const { parentPort } = require('worker_threads');
const { compress, decompress } = require('../src/shared/utils/CompressionFacade');

// Handle messages from main thread
parentPort.on('message', (message) => {
  const { workerId, articles, algorithm, level, windowBits } = message;

  try {
    const results = [];

    for (const article of articles) {
      const originalSize = article.uncompressed_size;
      const originalHtml = article.original_html;

      let compressionTime = 0;
      let decompressionTime = 0;
      let compressedSize = 0;
      let compressionRatio = 1;
      let compressionSuccess = false;
      let decompressionSuccess = false;

      if (algorithm !== 'none') {
        try {
          // Time compression
          const compressionStart = process.hrtime.bigint();
          const result = compress(originalHtml, {
            algorithm,
            level,
            windowBits: algorithm === 'brotli' ? windowBits : undefined
          });
          const compressionEnd = process.hrtime.bigint();
          compressionTime = Number(compressionEnd - compressionStart) / 1_000_000; // ms

          const compressedData = result.compressed;
          compressedSize = result.compressedSize;
          compressionRatio = result.ratio;
          compressionSuccess = true;

          // Time decompression
          try {
            const decompressionStart = process.hrtime.bigint();
            const decompressed = decompress(compressedData, algorithm);
            const decompressionEnd = process.hrtime.bigint();
            decompressionTime = Number(decompressionEnd - decompressionStart) / 1_000_000; // ms

            // Verify decompression worked
            if (decompressed.length === originalSize) {
              decompressionSuccess = true;
            }
          } catch (error) {
            // Decompression failed
            decompressionSuccess = false;
          }
        } catch (error) {
          // Compression failed
          compressionSuccess = false;
          decompressionSuccess = false;
        }
      } else {
        // No compression
        compressedSize = originalSize;
        compressionSuccess = true;
        decompressionSuccess = true;
      }

      results.push({
        urlId: article.url_id,
        url: article.url,
        originalSize,
        compressedSize,
        compressionRatio,
        compressionTime,
        decompressionTime,
        compressionSuccess,
        decompressionSuccess
      });
    }

    parentPort.postMessage({
      success: true,
      workerId,
      results
    });

  } catch (error) {
    parentPort.postMessage({
      success: false,
      workerId,
      error: error.message
    });
  }
});