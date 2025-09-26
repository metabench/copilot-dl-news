// Small utilities extracted from crawl.js without changing behavior
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nowMs() { return Date.now(); }
function jitter(ms, maxJitter = 250) { return ms + Math.floor(Math.random() * maxJitter); }
function parseRetryAfter(headerVal) {
  if (!headerVal) return null;
  const s = String(headerVal).trim();
  const asInt = parseInt(s, 10);
  if (!Number.isNaN(asInt)) return asInt * 1000;
  const asDate = Date.parse(s);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}
class MinHeap {
  constructor(compare) { this.data = []; this.compare = compare; }
  size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(item) { this.data.push(item); this._siftUp(this.data.length - 1); }
  pop() {
    const n = this.data.length; if (n === 0) return undefined; const top = this.data[0];
    const last = this.data.pop(); if (n > 1) { this.data[0] = last; this._siftDown(0); }
    return top;
  }
  _siftUp(i) { const d = this.data; const cmp = this.compare; let idx = i; while (idx > 0) { const p = Math.floor((idx - 1) / 2); if (cmp(d[idx], d[p]) < 0) { [d[idx], d[p]] = [d[p], d[idx]]; idx = p; } else break; } }
  _siftDown(i) { const d = this.data; const cmp = this.compare; let idx = i; const n = d.length; while (true) { let left = 2 * idx + 1, right = 2 * idx + 2, smallest = idx; if (left < n && cmp(d[left], d[smallest]) < 0) smallest = left; if (right < n && cmp(d[right], d[smallest]) < 0) smallest = right; if (smallest !== idx) { [d[idx], d[smallest]] = [d[smallest], d[idx]]; idx = smallest; } else break; } }
}
module.exports = { sleep, nowMs, jitter, parseRetryAfter, MinHeap };
