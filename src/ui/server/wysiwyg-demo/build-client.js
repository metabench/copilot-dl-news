const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Ensure output directory exists
const outDir = path.join(__dirname, 'public/js');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const build = async () => {
    console.log('Building client...');
    try {
        await esbuild.build({
            entryPoints: [path.join(__dirname, 'client.js')],
            bundle: true,
            outfile: path.join(outDir, 'bundle.js'),
            platform: 'browser',
            sourcemap: true,
            //alias: {
            //    'jsgui3-html': 'jsgui3-client'
            //},
            define: {
                'process.env.NODE_ENV': '"development"'
            }
        });
        console.log('Client built successfully');
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
};

build();
