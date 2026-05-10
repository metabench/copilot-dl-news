'use strict';

const {
  createClassicGazetteerAttributeStatements,
  recordClassicGazetteerAttribute,
  recordClassicGazetteerAttributes
} = require('news-crawler-db');

module.exports = {
  createAttributeStatements: createClassicGazetteerAttributeStatements,
  recordAttribute: recordClassicGazetteerAttribute,
  recordAttributes: recordClassicGazetteerAttributes
};
