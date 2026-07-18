// Shared gazetteer validation and repair algorithms
// Exports:
//  - validateGazetteer(db): returns { details, summary }
//  - repairGazetteer(db): performs safe fixes and returns a summary of actions

const { validateGazetteerIntegrity: validateGazetteer, repairGazetteerIntegrity: repairGazetteer } = require('news-crawler-db');

module.exports = { validateGazetteer, repairGazetteer };
