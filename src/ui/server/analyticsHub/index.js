'use strict';

/**
 * Analytics Hub - Historical analytics dashboard
 * 
 * @module analyticsHub
 */

const { AnalyticsService } = require('./AnalyticsService');
const { createApp, startServer, closeServer, initDb } = require('./server');
const controls = require('./controls');

module.exports = {
  AnalyticsService,
  createApp,
  startServer,
  closeServer,
  initDb,
  controls
};
