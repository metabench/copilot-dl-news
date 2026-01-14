// Shared gazetteer validation and repair algorithms
// Exports:
//  - validateGazetteer(db): returns { details, summary }
//  - repairGazetteer(db): performs safe fixes and returns a summary of actions

const { validateGazetteer, repairGazetteer } = require('../data/db/sqlite/tools/gazetteerQA');

module.exports = { validateGazetteer, repairGazetteer };
