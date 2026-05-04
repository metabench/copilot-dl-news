'use strict';

class ResourceShield {
  constructor() {
    this.startedAt = null;
    this.lastSample = null;
  }

  start() {
    this.startedAt = this.startedAt || new Date().toISOString();
    this.sample();
  }

  stop() {
    this.sample();
  }

  sample() {
    const memory = process.memoryUsage();
    this.lastSample = {
      sampledAt: new Date().toISOString(),
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
    };
    return this.lastSample;
  }

  getMetrics() {
    return {
      active: Boolean(this.startedAt),
      startedAt: this.startedAt,
      ...this.sample(),
    };
  }
}

const globalShield = new ResourceShield();

module.exports = {
  ResourceShield,
  globalShield,
};
