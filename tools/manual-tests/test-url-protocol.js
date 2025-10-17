// Test URL protocol issue
const testCases = [
  { raw: '/world/', base: 'https://www.theguardian.com' },
  { raw: 'https://www.theguardian.com/world/', base: 'https://www.theguardian.com' },
  { raw: '/world', base: 'https://www.theguardian.com' }
];

for (const { raw, base } of testCases) {
  try {
    const urlObj = new URL(raw, base || undefined);
    urlObj.hash = '';
    console.log(`✓ "${raw}" → ${urlObj.href}`);
    console.log(`  Protocol: ${urlObj.protocol}`);
  } catch (error) {
    console.log(`✗ "${raw}" → ERROR: ${error.message}`);
  }
}
