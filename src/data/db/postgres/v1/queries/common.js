'use strict';

const {
  postgresV1ToBoolInt,
  postgresV1ToNullableInt,
  postgresV1SafeStringify,
  postgresV1SafeParse,
  postgresV1ComputeDurationMs
} = require('news-crawler-db');

module.exports = {
  toBoolInt: postgresV1ToBoolInt,
  toNullableInt: postgresV1ToNullableInt,
  safeStringify: postgresV1SafeStringify,
  safeParse: postgresV1SafeParse,
  computeDurationMs: postgresV1ComputeDurationMs
};
