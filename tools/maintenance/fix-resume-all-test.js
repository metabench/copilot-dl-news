const fs = require('fs');

const file = fs.readFileSync('src/ui/express/__tests__/resume-all.api.test.js', 'utf8');

// Fix INSERT statements - add id column
let fixed = file.replace(
  /INSERT INTO crawl_jobs \(url, args, status, started_at, ended_at\) VALUES \(\?, \?, \?, \?, \?\)/g,
  'INSERT INTO crawl_jobs (id, url, args, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)'
);

// Fix .run() calls - add generateJobId() as first parameter
fixed = fixed.replace(
  /\.run\(\s*'https/g,
  ".run(\n      generateJobId(),\n      'https"
);

fixed = fixed.replace(
  /\.run\(\s*`https/g,
  ".run(\n      generateJobId(),\n      `https"
);

fixed = fixed.replace(
  /\.run\(\s*''/g,
  ".run(\n      generateJobId(),\n      ''"
);

fs.writeFileSync('src/ui/express/__tests__/resume-all.api.test.js', fixed);
console.log('Fixed all INSERT statements');
