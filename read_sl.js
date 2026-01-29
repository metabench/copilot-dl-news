const fs = require('fs');
try {
    const data = fs.readFileSync('subnets.json', 'utf16le').replace(/^\uFEFF/, '');
    const json = JSON.parse(data);
    if (json.data && json.data.length > 0) {
        console.log('Security List ID:', json.data[0]['security-list-ids'][0]);
    } else {
        console.log('No subnet data found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
