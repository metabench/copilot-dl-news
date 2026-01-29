'use strict';

const express = require('express');
const jsgui = require('jsgui3-html');
const { CrawlStrategyExplorerControl, CrawlProfileEditorControl } = require('./controls');
const { createCrawlService } = require('../../../server/crawl-api/core/crawlService');
const { CrawlerProfilesStore } = require('../../../core/crawler/profiles/CrawlerProfilesStore');

/**
 * Create the Crawl Strategies Router
 * 
 * Routes:
 * - GET /                    - List all operations grouped by category
 * - GET /sequences           - List all sequence presets
 * - GET /operation/:name     - Detail view for a single operation
 * - GET /profiles            - List saved profiles
 * - GET /profiles/new        - Create new profile form
 * - GET /profiles/:id        - Edit profile form
 * - GET /api/operations      - JSON API for operations list
 * - GET /api/sequences       - JSON API for sequences list
 */
function createCrawlStrategiesRouter({ logger, getDbRW } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  // Create crawl service to get operation/sequence data
  const crawlService = createCrawlService();

  function getAvailability() {
    const availability = crawlService.getAvailability({ logger });
    return {
      operations: availability.operations || [],
      sequences: availability.sequences || []
    };
  }

  function createContext() {
    return new jsgui.Page_Context();
  }

  function getProfilesStore() {
    const db = typeof getDbRW === 'function' ? getDbRW() : null;
    if (!db) return null;
    return new CrawlerProfilesStore({ db });
  }

  // Operations list view
  router.get('/', (req, res) => {
    try {
      const { operations, sequences } = getAvailability();
      const context = createContext(req);

      const control = new CrawlStrategyExplorerControl({
        context,
        basePath: '/crawl-strategies',
        operations,
        sequences,
        viewMode: 'operations'
      });

      res.type('html').send(control.render());
    } catch (err) {
      console.error('[crawl-strategies] Error rendering operations list:', err);
      res.status(500).send('Error loading operations');
    }
  });

  // Sequences view
  router.get('/sequences', (req, res) => {
    try {
      const { operations, sequences } = getAvailability();
      const context = createContext(req);

      const control = new CrawlStrategyExplorerControl({
        context,
        basePath: '/crawl-strategies',
        operations,
        sequences,
        viewMode: 'sequences'
      });

      res.type('html').send(control.render());
    } catch (err) {
      console.error('[crawl-strategies] Error rendering sequences:', err);
      res.status(500).send('Error loading sequences');
    }
  });

  // Operation detail view
  router.get('/operation/:name', (req, res) => {
    try {
      const { operations, sequences } = getAvailability();
      const opName = req.params.name;
      const selectedOperation = operations.find(op => op.name === opName);

      if (!selectedOperation) {
        res.status(404).send(`Operation not found: ${opName}`);
        return;
      }

      const context = createContext(req);

      const control = new CrawlStrategyExplorerControl({
        context,
        basePath: '/crawl-strategies',
        operations,
        sequences,
        viewMode: 'detail',
        selectedOperation
      });

      res.type('html').send(control.render());
    } catch (err) {
      console.error('[crawl-strategies] Error rendering operation detail:', err);
      res.status(500).send('Error loading operation');
    }
  });

  // Profiles list view
  router.get('/profiles', (req, res) => {
    try {
      const { operations, sequences } = getAvailability();
      const store = getProfilesStore();
      const { items: profiles, activeId } = store ? store.list() : { items: [], activeId: null };

      const context = createContext();

      const control = new CrawlStrategyExplorerControl({
        context,
        basePath: '/crawl-strategies',
        operations,
        sequences,
        viewMode: 'profiles',
        profiles,
        activeProfileId: activeId
      });

      res.type('html').send(control.render());
    } catch (err) {
      console.error('[crawl-strategies] Error rendering profiles:', err);
      res.status(500).send('Error loading profiles');
    }
  });

  // New profile form
  router.get('/profiles/new', (req, res) => {
    try {
      const { operations } = getAvailability();
      const context = createContext();

      const control = new CrawlProfileEditorControl({
        context,
        basePath: '/crawl-strategies',
        apiBase: '/api/crawler-profiles',
        profile: null,
        operations
      });

      res.type('html').send(control.render());
    } catch (err) {
      console.error('[crawl-strategies] Error rendering new profile form:', err);
      res.status(500).send('Error loading form');
    }
  });

  // Edit profile form
  router.get('/profiles/:id', (req, res) => {
    try {
      const { operations } = getAvailability();
      const store = getProfilesStore();

      if (!store) {
        res.status(503).send('Database unavailable');
        return;
      }

      const profile = store.get(req.params.id);
      if (!profile) {
        res.status(404).send(`Profile not found: ${req.params.id}`);
        return;
      }

      const context = createContext();

      const control = new CrawlProfileEditorControl({
        context,
        basePath: '/crawl-strategies',
        apiBase: '/api/crawler-profiles',
        profile,
        operations
      });

      res.type('html').send(control.render());
    } catch (err) {
      console.error('[crawl-strategies] Error rendering profile editor:', err);
      res.status(500).send('Error loading profile');
    }
  });

  // JSON API: Operations
  router.get('/api/operations', (req, res) => {
    try {
      const { operations } = getAvailability();
      res.json({
        success: true,
        count: operations.length,
        operations
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // JSON API: Sequences
  router.get('/api/sequences', (req, res) => {
    try {
      const { sequences } = getAvailability();
      res.json({
        success: true,
        count: sequences.length,
        sequences
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createCrawlStrategiesRouter };
