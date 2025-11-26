const { buildOptions } = require('./src/utils/optionsBuilder');

const schema = {
  loggingQueue: { type: 'boolean', default: true }
};

const input = { loggingQueue: false };
const result = buildOptions(input, schema);

console.log('Result:', result);
console.log('loggingQueue:', result.loggingQueue);
