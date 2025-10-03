import { createEventHub } from './events.js';
import { createTx } from './tx.js';

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (value && typeof value === 'object') {
    return { ...value };
  }
  return value;
}

export class DataModel {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._events = createEventHub();
  }

  get(prop) {
    if (typeof prop === 'undefined') {
      return { ...this._state };
    }
    return this._state[prop];
  }

  set(prop, value, options = {}) {
    if (prop && typeof prop === 'object' && !Array.isArray(prop)) {
      return this.replace(prop, options);
    }
    if (typeof prop !== 'string') {
      throw new TypeError('DataModel.set requires a property name string');
    }
    const previous = this._state[prop];
    const same = Object.is(previous, value);
    if (same && !options.force) {
      return previous;
    }
    const tx = options.tx || createTx();
    const stored = options.mutate ? value : cloneValue(value);
    this._state[prop] = stored;
    if (!options.silent) {
      const payload = { name: prop, value: stored, previous, model: this, tx };
      const meta = { tx };
      this._events.emit('change', payload, meta);
      this._events.emit(`change:${prop}`, payload, meta);
    }
    return stored;
  }

  update(prop, updater, options = {}) {
    if (typeof updater !== 'function') {
      throw new TypeError('DataModel.update requires an updater function');
    }
    const current = this.get(prop);
    const next = updater(current);
    return this.set(prop, next, options);
  }

  replace(next = {}, options = {}) {
    const tx = options.tx || createTx();
    const keys = new Set([
      ...Object.keys(this._state),
      ...Object.keys(next)
    ]);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        if (Object.prototype.hasOwnProperty.call(this._state, key)) {
          const previous = this._state[key];
          delete this._state[key];
          if (!options.silent) {
            const payload = { name: key, value: undefined, previous, removed: true, model: this, tx };
            const meta = { tx };
            this._events.emit('change', payload, meta);
            this._events.emit(`change:${key}`, payload, meta);
          }
        }
      } else {
        this.set(key, next[key], { ...options, force: options.force ?? true, tx });
      }
    }
    return this;
  }

  on(event, handler) {
    return this._events.on(event, handler);
  }

  onChange(prop, handler) {
    return this._events.on(`change:${prop}`, handler);
  }

  emit(event, payload) {
    this._events.emit(event, payload);
  }

  snapshot() {
    return { ...this._state };
  }

  clear() {
    this._state = {};
    this._events.clear();
  }
}
