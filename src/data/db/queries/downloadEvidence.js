'use strict';

const {
  getDownloadStats,
  getDownloadEvidence,
  getUrlEvidence,
  verifyDownloadClaim,
  getDownloadTimeline,
  getGlobalDownloadStats,
  getRecentDownloadVerifications,
  summarizeDownloadVerifications
} = require('news-crawler-db');

module.exports = {
  getDownloadStats,
  getDownloadEvidence,
  getUrlEvidence,
  verifyDownloadClaim,
  getDownloadTimeline,
  getGlobalStats: getGlobalDownloadStats,
  getRecentDownloadVerifications,
  summarizeDownloadVerifications
};
