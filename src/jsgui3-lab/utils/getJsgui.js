const preferClient = process.env.JSGUI3_USE_CLIENT === '1';

const tryRequire = (moduleName) => {
  try {
    return require(moduleName);
  } catch (err) {
    return null;
  }
};

let jsgui = null;

if (preferClient) {
  jsgui = tryRequire('jsgui3-client') || tryRequire('jsgui3-html');
} else {
  jsgui = tryRequire('jsgui3-html') || tryRequire('jsgui3-client');
}

if (!jsgui) {
  throw new Error('Unable to load jsgui3-html or jsgui3-client. Install dependencies first.');
}

module.exports = jsgui;
