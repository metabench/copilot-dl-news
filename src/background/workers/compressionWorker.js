/**
 * Compression Worker Thread
 * 
 * Performs Brotli compression in a separate thread to avoid blocking the main event loop.
 */

const { parentPort, workerData } = require('worker_threads');
const zlib = require('zlib');
const { promisify } = require('util');

const brotliCompress = promisify(zlib.brotliCompress);

// Get configuration from worker data
const { brotliQuality = 10, lgwin = 24 } = workerData;

// Brotli compression options
const brotliOptions = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality,
    [zlib.constants.BROTLI_PARAM_LGWIN]: lgwin, // Window size (24 = 256MB)
    [zlib.constants.BROTLI_PARAM_LGBLOCK]: 24,  // Block size
    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
  }
};

/**
 * Compress HTML content using Brotli
 */
async function compressHtml(html) {
  const buffer = Buffer.from(html, 'utf8');
  const compressed = await brotliCompress(buffer, brotliOptions);
  
  return {
    compressed,
    originalSize: buffer.length,
    compressedSize: compressed.length,
    ratio: (compressed.length / buffer.length * 100).toFixed(2)
  };
}

// Listen for messages from main thread
parentPort.on('message', async (msg) => {
  if (msg.type === 'compress') {
    try {
      const result = await compressHtml(msg.html);
      
      parentPort.postMessage({
        type: 'compressed',
        taskId: msg.taskId,
        articleId: msg.articleId,
        compressed: result.compressed,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        ratio: result.ratio
      });
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        taskId: msg.taskId,
        articleId: msg.articleId,
        error: error.message
      });
    }
  }
});

// Signal ready
parentPort.postMessage({ type: 'ready' });
