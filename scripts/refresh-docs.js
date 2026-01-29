const http = require('http');

const options = {
    hostname: '144.21.35.104',
    port: 4700,
    path: '/api/refresh',
    method: 'POST',
    headers: {
        'Content-Length': 0
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('BODY: ' + data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
