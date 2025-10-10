const { EventEmitter } = require('events');

/**
 * Minimal EventSource implementation using global fetch() for SSE tests.
 * Supports basic `event:` and `data:` parsing and emits `open` once the
 * connection is established. Consumers can listen for custom event types.
 */
class SimpleEventSource extends EventEmitter {
  constructor(url) {
    super();
    if (!url || typeof url !== 'string') {
      throw new TypeError('SimpleEventSource requires a URL string');
    }
    this._controller = new AbortController();
    this._buffer = '';
    this._connect(url);
  }

  async _connect(url) {
    try {
      const response = await fetch(url, {
        signal: this._controller.signal,
        headers: { Accept: 'text/event-stream' }
      });

      this.emit('open');

      if (!response.body || typeof response.body.getReader !== 'function') {
        throw new Error('Response body does not support streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (this._buffer) {
            this._flushBuffer();
          }
          break;
        }
        if (!value) continue;
        this._buffer += decoder.decode(value, { stream: true });
        this._drainBuffer();
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ECONNRESET' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('terminated'))) {
        return;
      }
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      } else {
        console.warn('[SimpleEventSource] stream error', err);
      }
    }
  }

  _drainBuffer() {
    // Normalize CRLF to LF for consistent parsing
    this._buffer = this._buffer.replace(/\r\n/g, '\n');
    let idx = this._buffer.indexOf('\n\n');
    while (idx >= 0) {
      const chunk = this._buffer.slice(0, idx);
      this._buffer = this._buffer.slice(idx + 2);
      this._dispatchChunk(chunk);
      idx = this._buffer.indexOf('\n\n');
    }
  }

  _flushBuffer() {
    const chunk = this._buffer.replace(/\r\n/g, '\n');
    this._buffer = '';
    if (chunk.trim().length > 0) {
      this._dispatchChunk(chunk);
    }
  }

  _dispatchChunk(raw) {
    const lines = raw.split('\n');
    let eventType = 'message';
    const dataLines = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) {
        continue;
      }
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimEnd());
      }
    }

    const payload = { data: dataLines.join('\n') };
    this.emit(eventType, payload);
  }

  close() {
    this._controller.abort();
  }
}

module.exports = {
  SimpleEventSource
};
