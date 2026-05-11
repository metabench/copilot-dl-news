"use strict";

const {
  selectDomainPage,
  countDomains,
  normalizeDomainListingSortColumn,
  normalizeDomainListingSortDirection
} = require("news-crawler-db");

module.exports = {
  selectDomainPage,
  countDomains,
  normalizeSortColumn: normalizeDomainListingSortColumn,
  normalizeSortDirection: normalizeDomainListingSortDirection
};
