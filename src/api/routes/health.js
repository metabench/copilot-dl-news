/**
 * Health Check API Routes
 *
 * Provides system health status and version information
 */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

/**
 * Create health check router
 * @param {Object} options - Configuration options
 * @param {string} options.dbPath - Path to database
 * @returns {express.Router} Health check router
 */
function createHealthRouter(options = {}) {
  const router = express.Router();
  const startTime = Date.now();

  // Get version from package.json
  const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
  let version = '0.0.0';
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    version = packageJson.version;
  } catch (err) {
    console.warn('Could not read package.json version:', err.message);
  }

  /**
   * GET /api/health
   * Health check endpoint
   *
   * @swagger
   * /api/health:
   *   get:
   *     summary: Health check
   *     description: Returns API health status and version information
   *     tags:
   *       - System
   *     responses:
   *       200:
   *         description: API is healthy
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HealthResponse'
   */
  router.get('/health', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // Check database connection
    let dbStatus = {
      connected: false,
      path: options.dbPath || 'not configured'
    };

    try {
      if (options.dbPath && fs.existsSync(options.dbPath)) {
        dbStatus.connected = true;
        dbStatus.size = fs.statSync(options.dbPath).size;
      }
    } catch (err) {
      dbStatus.error = err.message;
    }

    const health = {
      status: dbStatus.connected ? 'healthy' : 'degraded',
      version,
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      database: dbStatus
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  return router;
}

module.exports = {
  createHealthRouter
};
