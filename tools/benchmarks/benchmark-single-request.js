/**
 * Single HTTP request benchmark - measures just the request time
 */

const http = require('http');

const url = process.argv[2] || 'http://localhost:41000/queues/ssr';
const parsed = new URL(url);

console.log(`📊 Benchmarking: ${url}\n`);

const startTime = Date.now();

const req = http.get({
  hostname: parsed.hostname,
  port: parsed.port,
  path: parsed.pathname + parsed.search,
  timeout: 10000
}, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Response Time: ${duration}ms`);
    console.log(`📦 Status Code: ${res.statusCode}`);
    console.log(`📄 Content Length: ${data.length} bytes`);
    console.log(`📝 Content Type: ${res.headers['content-type']}`);
    
    // Check if HTML contains expected content
    if (data.includes('queues-table')) {
      console.log(`✅ Contains queues-table element`);
    }
    if (data.includes('data-jsgui-id')) {
      console.log(`✅ Contains data-jsgui-id attributes`);
    }
    if (data.includes('queues-enhancer.js')) {
      console.log(`✅ Includes progressive enhancement script`);
    }
    
    console.log(`\n✅ Request completed successfully`);
  });
});

req.on('error', (err) => {
  console.error(`❌ Request failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error(`❌ Request timeout`);
  process.exit(1);
});
