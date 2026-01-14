const { parentPort } = require('worker_threads');
const { decompress } = require('../../shared/utils/CompressionFacade');

if (!parentPort) {
  throw new Error('Decompression worker must be run as a worker thread');
}

parentPort.on('message', (msg) => {
  if (!msg || msg.type !== 'decompress' || !msg.taskId) {
    return;
  }

  try {
    const start = Date.now();
    const compressed = Buffer.isBuffer(msg.buffer) ? msg.buffer : Buffer.from(msg.buffer);
    const result = decompress(compressed, msg.algorithm);
    const output = Buffer.isBuffer(result) ? result : Buffer.from(result);

    parentPort.postMessage({
      type: 'decompressed',
      taskId: msg.taskId,
      buffer: output.buffer,
      byteOffset: output.byteOffset || 0,
      byteLength: output.byteLength,
      durationMs: Date.now() - start
    }, [output.buffer]);
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      taskId: msg.taskId,
      error: error?.message || String(error)
    });
  }
});
