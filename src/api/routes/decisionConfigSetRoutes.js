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
const router = express.Router();
const path = require('path');

// Lazy-load DecisionConfigSet to avoid circular dependencies
let DecisionConfigSet;
function getDecisionConfigSet() {
  if (!DecisionConfigSet) {
    DecisionConfigSet = require('../../crawler/observatory/DecisionConfigSet').DecisionConfigSet;
  }
  return DecisionConfigSet;
}

/**
 * GET /api/decision-config-sets
 * List all saved config sets
 */
router.get('/', async (req, res, next) => {
  try {
    const DCS = getDecisionConfigSet();
    const sets = await DCS.list();
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
 * GET /api/decision-config-sets/production
 * Get the current production config as a set
 */
router.get('/production', async (req, res, next) => {
  try {
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.fromProduction('production-snapshot');
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
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.load(req.params.slug);
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
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.load(req.params.slug);
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
    
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.fromProduction(name);
    
    if (description) {
      configSet.description = description;
    }
    
    const savedPath = await configSet.save();
    
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
    
    const DCS = getDecisionConfigSet();
    const original = await DCS.load(req.params.slug);
    const clone = original.clone(name);
    
    if (description) {
      clone.description = description;
    }
    
    const savedPath = await clone.save();
    
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
    
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.load(req.params.slug);
    
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
    
    await configSet.save();
    
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
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.load(req.params.slug);
    
    if (configSet.metadata.isProduction) {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot delete production config set' 
      });
    }
    
    await configSet.delete();
    
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
    const DCS = getDecisionConfigSet();
    const setA = await DCS.load(req.params.slug);
    const setB = await DCS.load(req.params.otherSlug);
    
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
    
    const DCS = getDecisionConfigSet();
    const configSet = await DCS.load(req.params.slug);
    
    const result = await configSet.promoteToProduction({ backup });
    
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

module.exports = router;
