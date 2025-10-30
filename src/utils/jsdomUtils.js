// Shared helpers for constructing jsdom instances with consistent logging behaviour.
const { JSDOM, VirtualConsole } = require('jsdom');

const CSS_PARSE_ERROR_RE = /Could not parse CSS stylesheet/i;

function createSilentVirtualConsole(options = {}) {
  const {
    ignoreCssParseErrors = true,
    ignoreConsoleOutput = true,
    onJsdomError = null,
    onConsoleEvent = null
  } = options;

  const virtualConsole = new VirtualConsole();

  virtualConsole.on('jsdomError', (error) => {
    const message = error && error.message ? error.message : String(error || '');
    if (ignoreCssParseErrors && CSS_PARSE_ERROR_RE.test(message)) {
      return;
    }
    if (typeof onJsdomError === 'function') {
      onJsdomError(error);
    }
  });

  if (ignoreConsoleOutput) {
    const listenerFactory = typeof onConsoleEvent === 'function'
      ? (type) => (...args) => onConsoleEvent(type, ...args)
      : () => () => {};
    for (const eventName of ['error', 'warn', 'info', 'log']) {
      virtualConsole.on(eventName, listenerFactory(eventName));
    }
  }

  return virtualConsole;
}

function createJsdom(html = '', options = {}) {
  const { url, jsdomOptions = {}, virtualConsoleOptions = {} } = options;

  const virtualConsole = virtualConsoleOptions === false
    ? undefined
    : createSilentVirtualConsole(virtualConsoleOptions);

  const domOptions = { ...jsdomOptions };

  if (url && typeof domOptions.url === 'undefined') {
    domOptions.url = url;
  }

  if (virtualConsole) {
    domOptions.virtualConsole = virtualConsole;
  }

  const dom = new JSDOM(html || '', domOptions);
  return { dom, virtualConsole };
}

module.exports = {
  createSilentVirtualConsole,
  createJsdom
};
