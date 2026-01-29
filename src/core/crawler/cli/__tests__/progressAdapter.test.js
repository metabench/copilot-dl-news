'use strict';

jest.mock('chalk', () => {
  const identity = (text) => String(text);
  const colorFn = Object.assign(identity, { bold: identity });
  return {
    green: colorFn,
    red: colorFn,
    yellow: colorFn,
    blue: colorFn,
    cyan: colorFn,
    gray: colorFn,
    white: colorFn,
    magenta: colorFn,
    dim: colorFn
  };
});

const { createCliConsoleInterceptor } = require('../progressAdapter');
const { setVerboseMode } = require('../progressReporter');

describe('progressAdapter', () => {
  let consoleRef;
  let originalLog;

  beforeEach(() => {
    originalLog = jest.fn();
    consoleRef = {
      log: originalLog,
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };
    setVerboseMode(false);
  });

  it('formats PAGE payloads as concise log lines', () => {
    const log = { formatGeographyProgress: jest.fn() };
    const { restore } = createCliConsoleInterceptor({ log, consoleRef });

    const payload = {
      url: 'https://example.com/page',
      source: 'network',
      status: 'success',
      downloadMs: 187,
      httpStatus: 200
    };

    consoleRef.log(`PAGE ${JSON.stringify(payload)}`);

    expect(originalLog).toHaveBeenCalledTimes(1);
    const rendered = originalLog.mock.calls[0][0];
    expect(rendered).toContain('https://example.com/page');
    expect(rendered).toContain('187ms');
    expect(rendered).toContain('network');

    restore();
  });

  it('suppresses CACHE lines when not in verbose mode', () => {
    const log = { formatGeographyProgress: jest.fn() };
    const { restore } = createCliConsoleInterceptor({ log, consoleRef });

    consoleRef.log('CACHE {"url":"https://example.com","source":"cache"}');

    expect(originalLog).not.toHaveBeenCalled();

    restore();
  });
});
