'use strict';

const path = require('path');

const { runStartupCheck } = require('../../utils/serverStartupCheck');

const serverPath = path.resolve(__dirname, '..', 'server.js');

runStartupCheck(serverPath, 3164, {
  serverName: 'DesignStudio',
  args: ['--design', path.join(process.cwd(), 'design')]
});
