#!/usr/bin/env node
'use strict';

/**
 * Check: Background Tasks Router - RateLimitError contract
 *
 * Verifies that both:
 * - POST /:id/start
 * - POST /actions/execute
 * surface RateLimitError as a stable 429 JSON payload.
 */

const express = require('express');
const request = require('supertest');

const { createBackgroundTasksRouter } = require('../src/api/routes/background-tasks');
const { RateLimitError } = require('../src/background/errors/RateLimitError');
const { ProposedAction } = require('../src/background/actions/ProposedAction');
const { Action } = require('../src/background/actions/Action');

function check(name, condition, expected, actual) {
  const pass = !!condition;
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    process.exitCode = 1;
  }
  return pass;
}

function createRateLimitError() {
  const action = new Action({
    id: 'stop-123',
    type: 'stop-task',
    label: 'Stop Task #123',
    parameters: { taskId: 123 }
  });

  const proposedAction = new ProposedAction({
    action,
    reason: 'Task already running',
    severity: 'warning',
    priority: 10
  });

  return new RateLimitError('Rate limited', {
    retryAfter: 30,
    proposedActions: [proposedAction],
    context: { taskType: 'analysis' }
  });
}

function createApp(taskManager) {
  const router = createBackgroundTasksRouter({
    taskManager,
    getDbRW: () => null,
    logger: { error: () => {}, info: () => {} }
  });

  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Check: Background Tasks Router - RateLimitError contract');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const rateLimitError = createRateLimitError();

  const taskManager = {
    listTasks: () => [],
    getTask: () => ({ id: 123, status: 'running' }),
    createTask: () => 123,
    startTask: async () => { throw rateLimitError; },
    pauseTask: async () => { throw rateLimitError; },
    resumeTask: async () => ({}),
    stopTask: async () => ({})
  };

  const app = createApp(taskManager);

  const expected = {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Rate limited',
      retryAfter: 30,
      context: { taskType: 'analysis' }
    },
    proposedActions: [
      {
        action: {
          id: 'stop-123',
          type: 'stop-task',
          label: 'Stop Task #123',
          parameters: { taskId: 123 }
        },
        reason: 'Task already running',
        description: null,
        severity: 'warning',
        priority: 10
      }
    ],
    retryAfter: 30,
    context: { taskType: 'analysis' }
  };

  const startResponse = await request(app).post('/123/start');
  check('POST /123/start returns 429', startResponse.status === 429, 429, startResponse.status);
  check('POST /123/start payload matches contract',
    JSON.stringify(startResponse.body) === JSON.stringify(expected),
    JSON.stringify(expected),
    JSON.stringify(startResponse.body)
  );

  const actionResponse = await request(app)
    .post('/actions/execute')
    .send({ action: { type: 'pause-task', parameters: { taskId: 123 } } });

  check('POST /actions/execute returns 429', actionResponse.status === 429, 429, actionResponse.status);
  check('POST /actions/execute payload matches contract',
    JSON.stringify(actionResponse.body) === JSON.stringify(expected),
    JSON.stringify(expected),
    JSON.stringify(actionResponse.body)
  );

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(process.exitCode ? '❌ Some checks failed' : '✅ All checks passed');
  console.log('───────────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Fatal error in background-tasks check:', err);
  process.exitCode = 1;
});
