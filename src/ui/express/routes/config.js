/**
 * Configuration API for enhanced crawl features
 * Provides endpoints for managing priority bonuses, feature flags, and analytics settings
 */

const express = require('express');
const { BadRequestError, NotFoundError, InternalServerError } = require('../errors/HttpError');

function createConfigAPI(configManager) {
  const router = express.Router();

  // Get current configuration
  router.get('/', (req, res, next) => {
    try {
      const config = configManager.getConfig();
      res.json({
        success: true,
        config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Update configuration
  router.post('/', (req, res, next) => {
    try {
      const updates = req.body;
      const result = configManager.updateConfig(updates) || {};

      if (result.success) {
        res.json({
          success: true,
          message: 'Configuration updated successfully',
          config: result.config || configManager.getConfig(),
          timestamp: new Date().toISOString()
        });
      } else {
        return next(new BadRequestError('Configuration update failed'));
      }
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Get feature flags
  router.get('/features', (req, res, next) => {
    try {
      const features = configManager.getFeatureFlags();
      res.json({
        success: true,
        features,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Update feature flags
  router.put('/features', (req, res, next) => {
    try {
      const features = req.body;
      const result = configManager.updateConfig({ features }) || {};

      if (result.success) {
        res.json({
          success: true,
          message: 'Feature flags updated successfully',
          features: configManager.getFeatureFlags(),
          timestamp: new Date().toISOString()
        });
      } else {
        return next(new BadRequestError('Failed to update feature flags'));
      }
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Get priority bonuses only
  router.get('/queue/bonuses', (req, res, next) => {
    try {
      const bonuses = configManager.getBonuses();
      res.json({
        success: true,
        bonuses,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Update priority bonuses
  router.put('/queue/bonuses', (req, res, next) => {
    try {
      const bonuses = req.body;
      const updates = {
        queue: {
          bonuses: Object.entries(bonuses).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'number' ? value : (typeof value === 'object' ? value.value : 0);
            return acc;
          }, {})
        }
      };
      
      const result = configManager.updateConfig(updates) || {};
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Priority bonuses updated successfully',
          bonuses: configManager.getBonuses(),
          timestamp: new Date().toISOString()
        });
      } else {
        return next(new BadRequestError('Failed to update priority bonuses'));
      }
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Get specific configuration section
  router.get('/:section', (req, res, next) => {
    try {
      const { section } = req.params;
      const config = configManager.getConfig();
      
      if (!Object.prototype.hasOwnProperty.call(config, section)) {
        return next(new NotFoundError(`Configuration section '${section}' not found`, 'section'));
      }

      res.json({
        success: true,
        section,
        data: config[section],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Update specific configuration section
  router.put('/:section', (req, res, next) => {
    try {
      const { section } = req.params;
      const updates = { [section]: req.body };
      
      const result = configManager.updateConfig(updates) || {};
      
      if (result.success) {
        const latestConfig = result.config || configManager.getConfig();
        res.json({
          success: true,
          message: `Section '${section}' updated successfully`,
          section,
          data: latestConfig[section],
          timestamp: new Date().toISOString()
        });
      } else {
        return next(new BadRequestError(`Failed to update section '${section}'`));
      }
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  // Configuration validation endpoint
  router.post('/validate', (req, res, next) => {
    try {
      const config = req.body;
      
      // Basic validation
      const errors = [];
      
      if (config.queue?.bonuses) {
        for (const [key, bonus] of Object.entries(config.queue.bonuses)) {
          const value = typeof bonus === 'object' ? bonus.value : bonus;
          if (typeof value !== 'number' || value < 0) {
            errors.push(`Invalid bonus value for ${key}: must be non-negative number`);
          }
        }
      }
      
      if (config.queue?.weights) {
        for (const [key, weight] of Object.entries(config.queue.weights)) {
          const value = typeof weight === 'object' ? weight.value : weight;
          if (typeof value !== 'number' || value < 0) {
            errors.push(`Invalid weight value for ${key}: must be non-negative number`);
          }
        }
      }
      
      if (config.features) {
        for (const [key, enabled] of Object.entries(config.features)) {
          if (typeof enabled !== 'boolean') {
            errors.push(`Invalid feature flag ${key}: must be boolean`);
          }
        }
      }
      
      res.json({
        success: errors.length === 0,
        valid: errors.length === 0,
        errors,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });

  return router;
}

module.exports = {
  createConfigAPI,
  createConfigApiRouter: createConfigAPI
};