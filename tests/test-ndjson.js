const fs = require('fs');
const ndjson = require('ndjson');

function testNdjson() {
  console.log('Starting NDJSON test...');
  const filePath = './data/gazetteer.ndjson';
  console.log('File exists:', fs.existsSync(filePath));

  if (!fs.existsSync(filePath)) {
    console.error('File does not exist');
    return;
  }

  const stats = fs.statSync(filePath);
  console.log('File size:', stats.size, 'bytes');

  const readStream = fs.createReadStream(filePath);
  const parser = ndjson.parse();
  let count = 0;

  console.log('Setting up event listeners...');

  parser.on('data', (record) => {
    count++;
    if (count === 1) {
      console.log('First record type:', record.type);
      console.log('First record keys:', Object.keys(record));
    }
    if (count >= 3) {
      console.log('Stopping after', count, 'records');
      readStream.destroy();
    }
  });

  parser.on('end', () => {
    console.log('Parser ended, processed', count, 'records');
  });

  parser.on('error', (err) => {
    console.error('Parser error:', err.message);
  });

  readStream.pipe(parser);
}

testNdjson();