'use strict';

const EventedCrawlerBase = require('../EventedCrawlerBase');

describe('EventedCrawlerBase', () => {
  let emitter;

  beforeEach(() => {
    emitter = new EventedCrawlerBase();
  });

  it('returns false when emitting without listeners', () => {
    expect(emitter.emit('test', { value: 1 })).toBe(false);
  });

  it('returns true when listeners are registered', () => {
    emitter.on('test', () => {});
    expect(emitter.emit('test', { value: 2 })).toBe(true);
  });

  it('supports once semantics', () => {
    const handler = jest.fn();
    emitter.once('test', handler);

    emitter.emit('test', { value: 3 });
    emitter.emit('test', { value: 4 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 3 });
  });

  it('removes listeners via removeListener/off aliases', () => {
    const handler = jest.fn();
    emitter.addListener('test', handler);

    emitter.removeListener('test', handler);
    emitter.emit('test', { value: 5 });

    expect(handler).not.toHaveBeenCalled();

    emitter.addListener('test', handler);
    emitter.off('test', handler);
    emitter.emit('test', { value: 6 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports chaining for on/addListener methods', () => {
    const handler = jest.fn();

    expect(emitter.on('alpha', handler)).toBe(emitter);
    expect(emitter.addListener('beta', handler)).toBe(emitter);
    expect(emitter.once('gamma', handler)).toBe(emitter);
    expect(emitter.removeEventListener('beta', handler)).toBe(emitter);
  });
});
