function createRequestTimingMiddleware({ logger = console } = {}) {
  return function requestTiming(req, res, next) {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const t1 = process.hrtime.bigint();
        const ms = Number(t1 - t0) / 1e6;
        const url = req.originalUrl || req.url;
        logger.log?.(`[req] ${req.method} ${url} -> ${res.statusCode} ${ms.toFixed(1)}ms`);
      } catch (_) {
        /* noop */
      }
    });
    next();
  };
}

module.exports = {
  createRequestTimingMiddleware
};
