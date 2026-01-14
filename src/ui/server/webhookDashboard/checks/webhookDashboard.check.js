'use strict';

const path = require('path');

const { runStartupCheck } = require('../../utils/serverStartupCheck');

const serverPath = path.resolve(__dirname, '..', 'server.js');

runStartupCheck(serverPath, 3161, {
  serverName: 'WebhookDashboard',
  timeout: 20000,
  args: ['--db-path', 'data/news.db']
});

