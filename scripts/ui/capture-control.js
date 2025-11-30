#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const puppeteer = require('puppeteer');
const jsgui = require('../../src/jsgui3-lab/utils/getJsgui');

const DEFAULT_CONTROLS_PATH = path.join('src', 'jsgui3-lab', 'controls');

const buildHtmlDocument = (bodyHtml, inlineScript) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; }
      .capture-root { padding: 16px; }
    </style>
    ${inlineScript ? `<script>${inlineScript}</script>` : ''}
  </head>
  <body>
    <div class="capture-root">${bodyHtml}</div>
  </body>
</html>`;

const renderControlHtml = (controlName, controlsPath, props) => {
  const filePath = path.isAbsolute(controlName)
    ? controlName
    : path.join(controlsPath, `${controlName}.js`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Control file not found: ${filePath}`);
  }
  const ControlClass = require(path.resolve(filePath));
  const context = new jsgui.Page_Context();
  const control = new ControlClass({ context, ...props });
  return control.all_html_render();
};

const run = async () => {
  const program = new Command();
  program
    .requiredOption('-c, --control <name>', 'Control class name (without .js)')
    .option('--controls-path <path>', 'Directory containing control files', DEFAULT_CONTROLS_PATH)
    .option('--props <json>', 'JSON props to pass to the control')
    .option('--screenshot <file>', 'Capture a screenshot to this path')
    .option('--eval <code>', 'JavaScript snippet to evaluate in the page context')
    .option('--client-script <file>', 'Optional JS file to inject for activation tests')
    .option('--output <file>', 'Write JSON results (e.g., eval output, screenshot path)')
    .option('--width <number>', 'Viewport width', (value) => parseInt(value, 10), 800)
    .option('--height <number>', 'Viewport height', (value) => parseInt(value, 10), 600)
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

  let inlineScript = '';
  if (opts.clientScript) {
    inlineScript = fs.readFileSync(path.resolve(opts.clientScript), 'utf8');
  }

  let html;
  try {
    html = renderControlHtml(opts.control, opts.controlsPath, parsedProps);
  } catch (err) {
    console.error('Failed to render control:', err.message);
    process.exit(1);
  }

  const docHtml = buildHtmlDocument(html, inlineScript);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
  await page.setContent(docHtml, { waitUntil: 'load' });

  let evalResult = null;
  if (opts.eval) {
    evalResult = await page.evaluate(opts.eval);
  }

  if (opts.screenshot) {
    await page.screenshot({ path: path.resolve(opts.screenshot) });
  }

  await browser.close();

  const summary = {
    control: opts.control,
    screenshot: opts.screenshot ? path.resolve(opts.screenshot) : null,
    evalResult
  };

  if (opts.output) {
    fs.writeFileSync(path.resolve(opts.output), JSON.stringify(summary, null, 2), 'utf8');
  }

  console.log('capture-control completed.');
  if (opts.output) {
    console.log(`Summary written to ${opts.output}`);
  }
};

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
