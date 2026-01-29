'use strict';

const { renderCliError } = require('../errorRenderer');

describe('renderCliError', () => {
  it('prints fallback message when error missing', () => {
    const stderr = jest.fn();
    renderCliError(null, { stderr, fallbackMessage: 'Fallback message' });

    expect(stderr).toHaveBeenCalledWith('Fallback message');
  });

  it('prints config path when provided on error object', () => {
    const stderr = jest.fn();
    const error = new Error('Something failed');
    error.configPath = 'C:/configs/crawl.js.config.json';

    renderCliError(error, { stderr });

    expect(stderr).toHaveBeenNthCalledWith(1, 'Something failed');
    expect(stderr).toHaveBeenNthCalledWith(2, 'Config file: C:/configs/crawl.js.config.json');
  });

  it('respects explicit showStack option', () => {
    const stderr = jest.fn();
    const error = new Error('Failure');
    error.stack = 'stack trace';

    renderCliError(error, { stderr, showStack: true });

    expect(stderr).toHaveBeenNthCalledWith(1, 'Failure');
    expect(stderr).toHaveBeenNthCalledWith(2, 'stack trace');
  });
});
