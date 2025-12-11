/**
 * Decision Config Set API Routes
 * 
 * Express router for managing decision config sets:
 * - List all sets
 * - Get a specific set
 * - Create/clone a set
 * - Update set properties
 * - Delete a set
 * - Compare two sets
 * - Promote to production
 * 
 * Mount: app.use('/api/decision-config-sets', configSetRoutes)
 */

const express = require('express');
const {
  createDefaultDecisionConfigSetRepository,
  DecisionConfigSetRepository
} = require('../../crawler/observatory/DecisionConfigSetRepository');
const { DecisionConfigPromotionService } = require('../../crawler/observatory/DecisionConfigPromotionService');
const {
  loadActiveDecisionConfigSet,
  setActiveDecisionConfigSlug
} = require('../../crawler/observatory/DecisionConfigSetState');

function createDecisionConfigSetRoutes({ repository: providedRepository, promotionService: providedPromotionService, dbPath = null } = {}) {
  const router = express.Router();

  // Lazy singletons per router instance
  let repository = providedRepository || null;
  let promotionService = providedPromotionService || null;

  function getRepository() {
    if (!repository) {
      repository = createDefaultDecisionConfigSetRepository();
    }
    return repository;
  }

  function getPromotionService() {
    if (!promotionService) {
      promotionService = new DecisionConfigPromotionService({ repository: getRepository() });
    }
    return promotionService;
  }

  async function requireDbAvailable(res) {
    if (!dbPath) {
      res.status(503).json({ success: false, error: 'Database path not configured for decision config sets' });
      return false;
    }
    return true;
  }

  /**
   * GET /api/decision-config-sets
   * List all saved config sets
   */
  router.get('/', async (req, res, next) => {
    try {
      const repo = getRepository();
      const sets = await repo.list();
      res.json({
        success: true,
        count: sets.length,
        sets
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/decision-config-sets/active
   * Return the currently active config set slug (persisted in DB)
   */
  router.get('/active', async (req, res, next) => {
    try {
      const repo = getRepository();
      if (!dbPath) {
        return res.json({ success: true, activeSlug: null, dbAvailable: false, summary: null });
      }

      const { configSet, slug, source } = await loadActiveDecisionConfigSet({
        repository: repo,
        dbPath,
        fallbackToProduction: false
      });

      res.json({
        success: true,
        activeSlug: slug,
        dbAvailable: true,
        source: slug ? source : 'none',
        summary: configSet?.getSummary ? configSet.getSummary() : null
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/decision-config-sets/active
   * Set the active config set slug in DB (validates existence)
   */
  router.post('/active', async (req, res, next) => {
    try {
      if (!(await requireDbAvailable(res))) return;
      const { slug } = req.body || {};
      if (!slug) {
        return res.status(400).json({ success: false, error: 'slug is required' });
      }

      const repo = getRepository();
      let configSet;
      try {
        configSet = await repo.load(slug);
      } catch (err) {
        if (err.message.includes('not found')) {
          return res.status(404).json({ success: false, error: err.message });
        }
        throw err;
      }

      await setActiveDecisionConfigSlug({ dbPath, slug });

      res.json({
        success: true,
        activeSlug: slug,
        summary: configSet?.getSummary ? configSet.getSummary() : configSet?.toJSON?.()
      });
    } catch (err) {
      next(err);
    }
  });

/**
 * GET /api/decision-config-sets/production
 * Get the current production config as a set
 */
router.get('/production', async (req, res, next) => {
  try {
    const repo = getRepository();
    const configSet = await repo.fromProduction('production-snapshot');
    res.json({
      success: true,
      configSet: configSet.getSummary(),
      full: configSet.toJSON()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/decision-config-sets/:slug
 * Get a specific config set by slug
 */
router.get('/:slug', async (req, res, next) => {
  try {
    const repo = getRepository();
    const configSet = await repo.load(req.params.slug);
    res.json({
      success: true,
      configSet: configSet.toJSON()
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/decision-config-sets/:slug/summary
 * Get just the summary of a config set
 */
router.get('/:slug/summary', async (req, res, next) => {
  try {
    const repo = getRepository();
    const configSet = await repo.load(req.params.slug);
    res.json({
      success: true,
      summary: configSet.getSummary()
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/decision-config-sets
 * Create a new config set from production
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    
    const repo = getRepository();
    const configSet = await repo.fromProduction(name);
    
    if (description) {
      configSet.description = description;
    }
    
    const savedPath = await repo.save(configSet);
    
    res.status(201).json({
      success: true,
      message: 'Config set created',
      slug: configSet.slug,
      path: savedPath
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/decision-config-sets/:slug/clone
 * Clone an existing config set
 */
router.post('/:slug/clone', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    
    const repo = getRepository();
    const original = await repo.load(req.params.slug);
    const clone = original.clone(name);
    
    if (description) {
      clone.description = description;
    }
    
    const savedPath = await repo.save(clone);
    
    res.status(201).json({
      success: true,
      message: 'Config set cloned',
      slug: clone.slug,
      parentSlug: clone.parentSlug,
      path: savedPath
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * PATCH /api/decision-config-sets/:slug
 * Update properties of a config set
 */
router.patch('/:slug', async (req, res, next) => {
  try {
    const { bonuses, weights, features, description, name } = req.body;
    
    const repo = getRepository();
    const configSet = await repo.load(req.params.slug);
    
    // Update metadata
    if (name) configSet.name = name;
    if (description !== undefined) configSet.description = description;
    
    // Update bonuses
    if (bonuses && typeof bonuses === 'object') {
      for (const [key, value] of Object.entries(bonuses)) {
        configSet.setPriorityBonus(key, value);
      }
    }
    
    // Update weights
    if (weights && typeof weights === 'object') {
      for (const [key, value] of Object.entries(weights)) {
        configSet.setPriorityWeight(key, value);
      }
    }
    
    // Update features
    if (features && typeof features === 'object') {
      for (const [key, value] of Object.entries(features)) {
        configSet.setFeature(key, Boolean(value));
      }
    }
    
    await repo.save(configSet);
    
    res.json({
      success: true,
      message: 'Config set updated',
      summary: configSet.getSummary(),
      changeLog: configSet.getChangeLog().slice(-10) // Last 10 changes
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/decision-config-sets/:slug
 * Delete a config set
 */
router.delete('/:slug', async (req, res, next) => {
  try {
    const repo = getRepository();
    const configSet = await repo.load(req.params.slug);
    
    if (configSet.metadata.isProduction) {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot delete production config set' 
      });
    }
    
    await repo.delete(configSet);
    
    res.json({
      success: true,
      message: 'Config set deleted',
      slug: req.params.slug
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/decision-config-sets/:slug/diff/:otherSlug
 * Compare two config sets
 */
router.get('/:slug/diff/:otherSlug', async (req, res, next) => {
  try {
    const repo = getRepository();
    const setA = await repo.load(req.params.slug);
    const setB = await repo.load(req.params.otherSlug);
    
    const diffs = setA.diff(setB);
    
    res.json({
      success: true,
      comparison: {
        setA: { slug: setA.slug, name: setA.name },
        setB: { slug: setB.slug, name: setB.name }
      },
      diffCount: diffs.length,
      diffs
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/decision-config-sets/:slug/promote
 * Promote a config set to production
 */
router.post('/:slug/promote', async (req, res, next) => {
  try {
    const { backup = true } = req.body;
    
    const repo = getRepository();
    const service = getPromotionService();
    const configSet = await repo.load(req.params.slug);

    const result = await service.promote(configSet, { backup });
    
    res.json({
      success: true,
      message: 'Config set promoted to production',
      slug: configSet.slug,
      backupPath: result.backupPath
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

  /**
   * Error handler
   */
  router.use((err, req, res, next) => {
    console.error('Decision Config Set API Error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  });

  return router;
}

const decisionConfigSetRoutes = createDecisionConfigSetRoutes();

module.exports = decisionConfigSetRoutes;
module.exports.createDecisionConfigSetRoutes = createDecisionConfigSetRoutes;
