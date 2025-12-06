const jsgui = require('jsgui3-html');
const Page = require('../Page');
const Server_Page_Context = jsgui.Server_Page_Context || jsgui.Page_Context;

console.log('Running WYSIWYG Demo check...');

// Safety timeout
setTimeout(() => {
    console.error('Check timed out');
    process.exit(1);
}, 5000);

try {
    const context = new Server_Page_Context({
        pool: {}
    });
    const page = new Page({ context });
    if (!page._composed) page.compose();
    const html = page.all_html_render();
    
    if (html.length > 0) {
        console.log('Check passed. HTML generated successfully.');
        console.log('HTML length:', html.length);
        console.log('HTML Content:', html);
        process.exit(0);
    } else {
        console.error('Check failed: Empty HTML generated');
        process.exit(1);
    }
} catch (e) {
    console.error('Check failed with error:', e);
    process.exit(1);
}
