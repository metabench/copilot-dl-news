class PatternAggregator {
  constructor(options = {}) {
    this.maxExamples = typeof options.maxExamples === 'number' && options.maxExamples >= 0
      ? options.maxExamples
      : 5;
    this.map = new Map();
  }

  _ensureEntry(pattern) {
    let entry = this.map.get(pattern);
    if (!entry) {
      entry = { pattern, count: 0, examples: [], examplesCount: 0 };
      this.map.set(pattern, entry);
    }
    return entry;
  }

  record(pattern, example = null) {
    if (!pattern) return;
    const entry = this._ensureEntry(pattern);
    entry.count += 1;
    if (example) {
      entry.examplesCount += 1;
      if (entry.examples.length < this.maxExamples) {
        entry.examples.push(example);
      }
    }
  }

  addCount(pattern, count = 0) {
    if (!pattern || !Number.isFinite(count) || count === 0) return;
    const entry = this._ensureEntry(pattern);
    entry.count += count;
  }

  mergeEntry(source) {
    if (!source || !source.pattern) return;
    const entry = this._ensureEntry(source.pattern);
    if (Number.isFinite(source.count)) {
      entry.count += source.count;
    }
    if (Number.isFinite(source.examplesCount)) {
      entry.examplesCount += source.examplesCount;
    }
    if (Array.isArray(source.examples)) {
      for (const example of source.examples) {
        if (entry.examples.length >= this.maxExamples) break;
        if (example) {
          entry.examples.push(example);
        }
      }
    }
  }

  mergeAggregator(other) {
    if (!other) return;
    if (other instanceof PatternAggregator) {
      for (const entry of other.entries()) {
        this.mergeEntry(entry);
      }
      return;
    }
    if (other instanceof Map) {
      for (const value of other.values()) {
        this.mergeEntry(value);
      }
      return;
    }
    if (Array.isArray(other)) {
      for (const entry of other) {
        this.mergeEntry(entry);
      }
      return;
    }
    if (other && typeof other === 'object') {
      for (const value of Object.values(other)) {
        this.mergeEntry(value);
      }
    }
  }

  entries() {
    return this.map.values();
  }

  isEmpty() {
    return this.map.size === 0;
  }

  clone() {
    const clone = new PatternAggregator({ maxExamples: this.maxExamples });
    clone.mergeAggregator(this.map);
    return clone;
  }

  summary() {
    const sorted = Array.from(this.entries()).sort((a, b) => {
      return (b.count || 0) - (a.count || 0);
    });
    let totalExamples = 0;
    const patterns = sorted.map((entry) => {
      const count = entry.count || 0;
      totalExamples += count;
      const examplesSeen = entry.examplesCount || entry.examples.length || 0;
      return {
        pattern: entry.pattern,
        confidence: Math.min(count / 5, 1),
        verified: count >= 3,
        examples: examplesSeen
      };
    });
    return { patterns, totalExamples };
  }

  toDebugArray() {
    return Array.from(this.entries()).sort((a, b) => (b.count || 0) - (a.count || 0));
  }
}

module.exports = {
  PatternAggregator
};
