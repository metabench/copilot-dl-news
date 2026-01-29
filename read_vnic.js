const fs = require('fs');
try {
    const data = fs.readFileSync('vnics_full.json', 'utf16le').replace(/^\uFEFF/, '');
    const json = JSON.parse(data);
    if (json.data && json.data.length > 0) {
        console.log('VNIC ID:', json.data[0].id);
        console.log('Public IP:', json.data[0]['public-ip']);
    } else {
        console.log('No VNIC data found');
    }
} catch (e) {
    console.error('Error reading/parsing file:', e.message);
}
