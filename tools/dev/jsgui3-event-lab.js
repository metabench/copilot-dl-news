#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { JSDOM } = require('jsdom');

process.env.JSGUI3_USE_CLIENT = process.env.JSGUI3_USE_CLIENT || '1';
const getJsgui = require(path.join(__dirname, '../../src/jsgui3-lab/utils/getJsgui'));

const DEFAULT_CONTROLS_PATH = path.join('src', 'jsgui3-lab', 'controls');

const ensureDomGlobals = (dom) => {
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
};

const createEvent = (type, window, detail = {}) => {
  if (/^key/.test(type)) {
    return new window.KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: detail.key || 'Enter'
    });
  }
  return new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: detail.clientX || 0,
    clientY: detail.clientY || 0
  });
};

const wrapControlForLogging = (control, eventLog) => {
  if (!control || typeof control !== 'object') return;
  if (typeof control.raise === 'function' && !control.__eventLabRaiseWrapped) {
    const originalRaise = control.raise.bind(control);
    control.raise = function raise(eventName, payload) {
      eventLog.push({ kind: 'raise', eventName, payload, timestamp: Date.now() });
      return originalRaise(eventName, payload);
    };
    control.__eventLabRaiseWrapped = true;
  }
  if (typeof control.on === 'function' && !control.__eventLabOnWrapped) {
    const originalOn = control.on.bind(control);
    control.on = function on(eventName, handler) {
      eventLog.push({ kind: 'on', eventName, timestamp: Date.now() });
      return originalOn(eventName, handler);
    };
    control.__eventLabOnWrapped = true;
  }
};

const runEventLab = async (options) => {
  const controlsPath = options.controlsPath || DEFAULT_CONTROLS_PATH;
  const controlFile = path.isAbsolute(options.control)
    ? options.control
    : path.join(controlsPath, `${options.control}.js`);

  if (!fs.existsSync(controlFile)) {
    throw new Error(`Control file not found: ${controlFile}`);
  }

  const ControlClass = require(path.resolve(controlFile));
  const jsgui = getJsgui;

  const baseProps = options.props || {};
  const serverContext = new jsgui.Page_Context();
  const serverControl = new ControlClass({ context: serverContext, ...baseProps });
  const html = serverControl.all_html_render();

  const dom = new JSDOM('<!doctype html><html><body><div id="event-lab-root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  ensureDomGlobals(dom);

  const mount = dom.window.document.getElementById('event-lab-root');
  mount.innerHTML = html;
  const rootEl = mount.firstElementChild;

  const clientContext = new jsgui.Page_Context();
  clientContext.document = dom.window.document;
  clientContext.window = dom.window;
  clientContext.map_els = clientContext.map_els || {};
  clientContext.map_controls = clientContext.map_controls || {};

  const activationProps = { context: clientContext, el: rootEl, ...baseProps };
  const activatedControl = new ControlClass(activationProps);
  const eventLog = [];
  wrapControlForLogging(activatedControl, eventLog);
  if (typeof activatedControl.rec_desc_ensure_ctrl_el_refs === 'function') {
    activatedControl.rec_desc_ensure_ctrl_el_refs(rootEl);
  }
  if (typeof activatedControl.activate === 'function') {
    activatedControl.activate();
  }

  const dispatchResults = [];
  const dispatches = options.dispatches || [];
  for (const dispatch of dispatches) {
    const target = dispatch.selector
      ? dom.window.document.querySelector(dispatch.selector)
      : rootEl;
    if (!target) {
      dispatchResults.push({ ...dispatch, status: 'target-not-found' });
      continue;
    }
    const event = createEvent(dispatch.type, dom.window, dispatch.detail);
    target.dispatchEvent(event);
    dispatchResults.push({ ...dispatch, status: 'dispatched' });
  }

  let detachParent = null;
  if (options.simulateDetach && rootEl?.parentNode) {
    detachParent = rootEl.parentNode;
    detachParent.removeChild(rootEl);
  }

  if (options.simulateReattach && detachParent) {
    detachParent.appendChild(rootEl);
    if (typeof activatedControl.rec_desc_ensure_ctrl_el_refs === 'function') {
      activatedControl.rec_desc_ensure_ctrl_el_refs(rootEl);
    }
  }

  const summary = {
    control: options.control,
    dispatches: dispatchResults,
    eventLog,
    detachSimulated: Boolean(options.simulateDetach),
    reattachSimulated: Boolean(options.simulateReattach),
    domChildCount: mount.childElementCount,
    html,
    controlLog: Array.isArray(activatedControl.log) ? [...activatedControl.log] : null
  };

  if (options.writeHtml) {
    fs.writeFileSync(path.resolve(options.writeHtml), html, 'utf8');
  }

  if (options.writeJson) {
    fs.writeFileSync(path.resolve(options.writeJson), JSON.stringify(summary, null, 2), 'utf8');
  }

  return summary;
};

const parseDispatchTokens = (tokens = []) => tokens.map((token) => {
  const [type, selector] = token.split(':');
  return { type, selector: selector || null };
});

const runCli = async () => {
  const program = new Command();
  program
    .requiredOption('-c, --control <name>', 'Control class name (without .js)')
    .option('--controls-path <path>', 'Directory containing control files', DEFAULT_CONTROLS_PATH)
    .option('--props <json>', 'JSON string with props to pass to the control')
    .option('--dispatch <event...>', 'Event dispatch instructions (type or type:selector)')
    .option('--simulate-detach', 'Remove the root element to test cleanup')
    .option('--simulate-reattach', 'Reattach the root element after detaching')
    .option('--write-html <file>', 'Write rendered HTML to a file')
    .option('--write-json <file>', 'Write summary JSON to a file')
    .option('--log-summary', 'Print JSON summary to stdout')
    .parse(process.argv);

  const opts = program.opts();
  let parsedProps = {};
  if (opts.props) {
    try {
      parsedProps = JSON.parse(opts.props);
    } catch (err) {
      console.error('Failed to parse props JSON:', err.message);
      process.exit(1);
    }
  }

  const dispatches = parseDispatchTokens(opts.dispatch || []);

  try {
    const summary = await runEventLab({
      control: opts.control,
      controlsPath: opts.controlsPath,
      props: parsedProps,
      dispatches,
      simulateDetach: Boolean(opts.simulateDetach),
      simulateReattach: Boolean(opts.simulateReattach),
      writeHtml: opts.writeHtml,
      writeJson: opts.writeJson
    });

    if (opts.logSummary) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`jsgui3-event-lab completed for ${opts.control}.`);
    }
  } catch (err) {
    console.error('jsgui3-event-lab error:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  runCli();
}

module.exports = { runEventLab };
