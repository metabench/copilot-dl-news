const fs = require('fs');
try {
    const data = fs.readFileSync('sl_backup.json', 'utf8');
    const json = JSON.parse(data); // This is the full output { data: { ... } }

    let rules = json.data['ingress-security-rules'];

    // Check if rule exists
    const exists = rules.some(r =>
        r.protocol === "6" &&
        r.tcpOptions &&
        r.tcpOptions.destinationPortRange &&
        r.tcpOptions.destinationPortRange.min === 3120
    );

    if (!exists) {
        rules.push({
            "source": "0.0.0.0/0",
            "protocol": "6", // TCP
            "isStateless": false,
            "tcpOptions": {
                "destinationPortRange": {
                    "min": 3120,
                    "max": 3120
                }
            },
            "description": "Allow Direct Access to Crawler Lab"
        });
        console.log('Added rule for port 3120.');
    } else {
        console.log('Rule already exists.');
    }

    // Output ONLY the rules array for the CLI argument
    fs.writeFileSync('sl_update.json', JSON.stringify(rules, null, 2));
    console.log('Wrote sl_update.json');

} catch (e) {
    console.error('Error:', e.message);
}
