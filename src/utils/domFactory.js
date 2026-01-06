const { JSDOM, VirtualConsole } = require('jsdom');
const { parseHTML } = require('linkedom');

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

/**
 * Create a DOM instance using the specified engine.
 * @param {string} html - The HTML content to parse.
 * @param {object} options - Configuration options.
 * @param {string} [options.url] - The URL of the page (for resolving relative links).
 * @param {string} [options.engine='linkedom'] - The DOM engine to use ('jsdom' or 'linkedom').
 * @param {object} [options.jsdomOptions] - Options specific to JSDOM.
 * @param {object} [options.virtualConsoleOptions] - Options for JSDOM's VirtualConsole.
 * @returns {object} An object containing { dom, virtualConsole, window, document }.
 */
function createDom(html = '', options = {}) {
  const { url, engine = 'linkedom', jsdomOptions = {}, virtualConsoleOptions = {} } = options;

  if (engine === 'linkedom') {
    // linkedom doesn't support all JSDOM options, but we can handle basic ones
    const { window, document } = parseHTML(html);
    
    // Shim some JSDOM-like properties if needed
    if (window && url) {
        // linkedom doesn't strictly enforce location like JSDOM, but we can try to set it if needed
        // For now, we assume the consumer handles URL resolution if the DOM doesn't
        // But linkedom's window.location is often read-only or limited.
        // We can try to patch it if critical, but usually it's fine.
    }

    // Add close method to window if missing (linkedom doesn't need it, but consumers might call it)
    if (!window.close) {
        window.close = () => {};
    }

    // Return a consistent interface
    return {
      dom: {
        window: window,
        // linkedom doesn't have a .serialize() on the "dom" object usually, 
        // but the window.document has .toString() or outerHTML
        serialize: () => document.toString(),
        window: window // Redundant but keeps structure if accessed via dom.window
      },
      virtualConsole: null, // linkedom doesn't use virtual console
      window: window,
      document: document
    };
  }

  // Default to JSDOM
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
  return { 
      dom, 
      virtualConsole,
      window: dom.window,
      document: dom.window.document
  };
}

// Backward compatibility alias
function createJsdom(html, options) {
    return createDom(html, { ...options, engine: 'jsdom' });
}

module.exports = {
  createSilentVirtualConsole,
  createDom,
  createJsdom
};
