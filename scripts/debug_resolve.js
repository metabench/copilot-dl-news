const fs = require('fs');
const path = require('path');

console.log('--- DEBUG RESOLVE START ---');
console.log('CWD:', process.cwd());
console.log('__dirname:', __dirname);

const moduleName = 'jsgui3-html';

try {
    const paths = require.resolve.paths(moduleName);
    console.log(`Resolution paths for '${moduleName}':`);
    paths.forEach(p => console.log('  ' + p));

    console.log('Attempting resolve...');
    const resolved = require.resolve(moduleName);
    console.log('Successfully resolved to:', resolved);

    console.log('Attempting require...');
    const pkg = require(moduleName);
    console.log('Successfully required. Type:', typeof pkg);

} catch (err) {
    console.error('ERROR:', err.message);
    if (err.code === 'MODULE_NOT_FOUND') {
        console.log('Checking expected path: apps/shared/node_modules/jsgui3-html');
        // Construct path relative to __dirname (apps/shared/isomorphic)
        // ../node_modules/jsgui3-html
        const expected = path.resolve(__dirname, '..', 'node_modules', moduleName);
        console.log('Expected location:', expected);
        console.log('Exists?', fs.existsSync(expected));
        if (fs.existsSync(expected)) {
            console.log('Listing content of expected location:');
            console.log(fs.readdirSync(expected));

            const pkgJson = path.join(expected, 'package.json');
            if (fs.existsSync(pkgJson)) {
                console.log('Content of package.json:', fs.readFileSync(pkgJson, 'utf8'));
            } else {
                console.log('package.json missing!');
            }
        }
    }
}
console.log('--- DEBUG RESOLVE END ---');
