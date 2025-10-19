#!/usr/bin/env node

/**
 * decompression-benchmark-worker.js - Worker thread for decompression benchmarking
 */

const { parentPort } = require('worker_threads');
const { decompress } = require('../src/utils/compression');

// Handle messages from main thread
parentPort.on('message', (message) => {
  const { workerId, articles } = message;

  try {
    const results = [];

    for (const article of articles) {
      const startTime = process.hrtime.bigint();
      // Convert to Buffer if needed
      const compressedData = Buffer.isBuffer(article.content_blob) ? article.content_blob : Buffer.from(article.content_blob);
      const readTime = Number(process.hrtime.bigint() - startTime) / 1_000_000; // μs

      let decompressTime = 0;
      let decompressedData = null;
      let success = false;

      if (article.algorithm !== 'none') {
        try {
          const decompressStart = process.hrtime.bigint();
          decompressedData = decompress(compressedData, article.algorithm);
          const decompressEnd = process.hrtime.bigint();
          decompressTime = Number(decompressEnd - decompressStart) / 1_000_000; // ms
          success = true;
        } catch (error) {
          // Decompression failed
          success = false;
        }
      } else {
        // No compression
        decompressedData = compressedData;
        success = true;
      }

      results.push({
        id: article.id,
        url: article.url,
        readTime,
        decompressTime,
        compressedSize: compressedData.length,
        uncompressedSize: decompressedData ? decompressedData.length : 0,
        algorithm: article.algorithm,
        level: article.level,
        success
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