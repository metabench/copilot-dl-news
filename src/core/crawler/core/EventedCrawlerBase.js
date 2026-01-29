'use strict';

const { Evented_Class } = require('lang-tools');

/**
 * Adapter bridging lang-mini's Evented_Class with Node.js EventEmitter semantics.
 * Provides familiar helpers (`emit`, `once`, `addListener`, `removeListener`) so
 * crawler components can migrate without rewriting existing listener code.
 */
class EventedCrawlerBase extends Evented_Class {
  emit(eventName, ...args) {
    const results = super.raise(eventName, ...args);
    return Array.isArray(results) && results.length > 0;
  }

  on(eventName, handler) {
    super.on(eventName, handler);
    return this;
  }

  addListener(eventName, handler) {
    return this.on(eventName, handler);
  }

  once(eventName, handler) {
    super.one(eventName, handler);
    return this;
  }

  removeListener(eventName, handler) {
    if (typeof handler === 'function') {
      this.remove_event_listener(eventName, handler);
    }
    return this;
  }

  off(eventName, handler) {
    return this.removeListener(eventName, handler);
  }

  removeEventListener(eventName, handler) {
    return this.removeListener(eventName, handler);
  }
}

module.exports = EventedCrawlerBase;
