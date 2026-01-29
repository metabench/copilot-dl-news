const fs = require('fs');
try {
    const data = fs.readFileSync('all_sl.json', 'utf16le').replace(/^\uFEFF/, '');
    const json = JSON.parse(data);
    if (json.data && json.data.length > 0) {
        console.log('Found', json.data.length, 'Security Lists.');
        const sl = json.data[0];
        console.log('ID:', sl.id);
        console.log('Name:', sl['display-name']);

        // Also dump this SL to sl_backup.json for the next step so we don't need to re-fetch
        fs.writeFileSync('sl_backup.json', JSON.stringify({ data: sl }, null, 2));
        console.log('Dumped to sl_backup.json');

    } else {
        console.log('No Security Lists found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
