// Test URL normalization with trailing slashes
const { UrlPolicy } = require('../../src/crawler/urlPolicy');

const testCases = [
  { raw: '/world/', base: 'https://www.theguardian.com' },
  { raw: 'https://www.theguardian.com/world/', base: 'https://www.theguardian.com' },
  { raw: '/lifeandstyle/', base: 'https://www.theguardian.com' }
];

const policy = new UrlPolicy({ baseUrl: 'https://www.theguardian.com' });

console.log('Testing URL normalization:\n');
for (const { raw, base } of testCases) {
  try {
    const normalized = policy.normalize(raw);
    console.log(`✓ "${raw}"`);
    console.log(`  Normalized: ${normalized}`);
    
    const analysis = policy.analyze(raw);
    if (analysis && analysis.url) {
      console.log(`  Protocol: ${analysis.url.protocol}`);
      console.log(`  Hostname: ${analysis.url.hostname}`);
    }
    console.log('');
  } catch (error) {
    console.log(`✗ "${raw}" → ERROR: ${error.message}\n`);
  }
}
