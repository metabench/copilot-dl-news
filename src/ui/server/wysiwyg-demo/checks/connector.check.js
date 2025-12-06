const Page = require('../Page');
const jsgui = require('jsgui3-html');
const { Server_Page_Context } = jsgui;

const context = new Server_Page_Context({
    req: { headers: {} },
    res: {},
    pool: {}
});

const page = new Page({ context });
const html = page.all_html_render();

console.log('Rendered HTML length:', html.length);

// Check for SVG layer
if (html.includes('class="canvas-svg-layer"')) {
    console.log('✅ Canvas SVG layer found');
} else {
    console.error('❌ Canvas SVG layer NOT found');
    process.exit(1);
}

// Check for Connector (path)
if (html.includes('<path')) {
    console.log('✅ Connector path found');
} else {
    console.error('❌ Connector path NOT found');
    process.exit(1);
}

// Check for Resizable handles
if (html.includes('class="resize-handle handle-se"')) {
    console.log('✅ Resize handles found');
} else {
    console.error('❌ Resize handles NOT found');
    process.exit(1);
}

console.log('All checks passed!');
