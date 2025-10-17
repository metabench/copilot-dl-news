/**
 * Crawl Strategy Templates - Specialized strategies per use case
 * 
 * Provides reusable strategy templates for different crawling scenarios:
 * - Fast breadth scan (discover quickly, shallow depth)
 * - Deep quality crawl (thorough extraction, slow)
 * - Update check (revisit known hubs for new content)
 * - Gap filling (find missing articles in sparse coverage)
 * - Custom user-defined templates
 */

class CrawlStrategyTemplates {
  constructor({ db, logger = console } = {}) {
    this.db = db;
    this.logger = logger;

    // Template cache
    this.templates = new Map();
    this.userTemplates = new Map();

    // Initialize built-in templates
    this._initializeBuiltInTemplates();
  }

  /**
   * Get a strategy template by name
   */
  getTemplate(name) {
    // Check user templates first (can override built-ins)
    if (this.userTemplates.has(name)) {
      return this.userTemplates.get(name);
    }

    // Fall back to built-in templates
    if (this.templates.has(name)) {
      return this.templates.get(name);
    }

    return null;
  }

  /**
   * List all available templates
   */
  listTemplates(includeUserTemplates = true) {
    const templates = [];

    // Built-in templates
    for (const [name, template] of this.templates.entries()) {
      templates.push({
        name,
        type: 'built-in',
        description: template.description,
        useCase: template.useCase
      });
    }

    // User templates
    if (includeUserTemplates) {
      for (const [name, template] of this.userTemplates.entries()) {
        templates.push({
          name,
          type: 'user-defined',
          description: template.description,
          useCase: template.useCase
        });
      }
    }

    return templates;
  }

  /**
   * Create a custom strategy template
   */
  async createTemplate(name, templateConfig) {
    const template = {
      name,
      description: templateConfig.description || 'Custom strategy',
      useCase: templateConfig.useCase || 'general',
      type: 'user-defined',
      createdAt: new Date().toISOString(),
      config: this._validateTemplateConfig(templateConfig)
    };

    // Store in memory
    this.userTemplates.set(name, template);

    // Persist to database
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO strategy_templates (
            name, description, use_case, template_config, created_at
          ) VALUES (?, ?, ?, ?, datetime('now'))
        `);

        stmt.run(
          name,
          template.description,
          template.useCase,
          JSON.stringify(template.config)
        );

        this.logger.log?.('[Strategy]', `Created template: ${name}`);
      } catch (error) {
        this.logger.error?.('Failed to save template', error);
      }
    }

    return template;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(name, updates) {
    const existing = this.userTemplates.get(name);
    if (!existing) {
      throw new Error(`Template not found: ${name}`);
    }

    const updated = {
      ...existing,
      ...updates,
      config: updates.config ? this._validateTemplateConfig(updates.config) : existing.config,
      updatedAt: new Date().toISOString()
    };

    this.userTemplates.set(name, updated);

    // Update in database
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          UPDATE strategy_templates 
          SET description = ?, use_case = ?, template_config = ?, updated_at = datetime('now')
          WHERE name = ?
        `);

        stmt.run(
          updated.description,
          updated.useCase,
          JSON.stringify(updated.config),
          name
        );

        this.logger.log?.('[Strategy]', `Updated template: ${name}`);
      } catch (error) {
        this.logger.error?.('Failed to update template', error);
      }
    }

    return updated;
  }

  /**
   * Delete a user template
   */
  async deleteTemplate(name) {
    if (this.templates.has(name)) {
      throw new Error(`Cannot delete built-in template: ${name}`);
    }

    if (!this.userTemplates.has(name)) {
      throw new Error(`Template not found: ${name}`);
    }

    this.userTemplates.delete(name);

    // Delete from database
    if (this.db) {
      try {
        const stmt = this.db.prepare('DELETE FROM strategy_templates WHERE name = ?');
        stmt.run(name);

        this.logger.log?.('[Strategy]', `Deleted template: ${name}`);
      } catch (error) {
        this.logger.error?.('Failed to delete template', error);
      }
    }
  }

  /**
   * Apply a template to create a crawl configuration
   */
  applyTemplate(templateName, context = {}) {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const config = { ...template.config };

    // Apply context overrides
    if (context.domain) {
      config.domain = context.domain;
    }
    if (context.maxDepth !== undefined) {
      config.maxDepth = context.maxDepth;
    }
    if (context.maxConcurrency !== undefined) {
      config.maxConcurrency = context.maxConcurrency;
    }

    // Merge additional context
    config.context = {
      ...config.context,
      ...context
    };

    return {
      templateName,
      config,
      appliedAt: new Date().toISOString()
    };
  }

  /**
   * Load user templates from database
   */
  async loadUserTemplates() {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        SELECT name, description, use_case, template_config, created_at
        FROM strategy_templates
        ORDER BY created_at DESC
      `);

      const rows = stmt.all();

      for (const row of rows) {
        const template = {
          name: row.name,
          description: row.description,
          useCase: row.use_case,
          type: 'user-defined',
          createdAt: row.created_at,
          config: JSON.parse(row.template_config)
        };

        this.userTemplates.set(row.name, template);
      }

      this.logger.log?.('[Strategy]', `Loaded ${rows.length} user templates`);
    } catch (error) {
      // Table might not exist yet
      this.logger.warn?.('Could not load user templates', error.message);
    }
  }

  /**
   * Get strategy statistics
   */
  getStats() {
    return {
      builtInTemplates: this.templates.size,
      userTemplates: this.userTemplates.size,
      totalTemplates: this.templates.size + this.userTemplates.size,
      templateNames: {
        builtIn: Array.from(this.templates.keys()),
        user: Array.from(this.userTemplates.keys())
      }
    };
  }

  // Private helpers

  _initializeBuiltInTemplates() {
    // Template 1: Fast Breadth Scan
    this.templates.set('fast-breadth-scan', {
      name: 'fast-breadth-scan',
      description: 'Discover hubs quickly with shallow crawling',
      useCase: 'discovery',
      type: 'built-in',
      config: {
        maxDepth: 2,
        maxConcurrency: 10,
        timeout: 5000,
        maxArticlesPerHub: 20,
        followLinks: true,
        extractContent: false,
        prioritizeHubDiscovery: true,
        retryStrategy: {
          maxRetries: 1,
          backoffMultiplier: 1.5
        },
        filters: {
          skipKnownUrls: true,
          skipLowPriorityHubs: true
        },
        context: {
          strategy: 'fast',
          goal: 'discover'
        }
      }
    });

    // Template 2: Deep Quality Crawl
    this.templates.set('deep-quality-crawl', {
      name: 'deep-quality-crawl',
      description: 'Thorough extraction with deep crawling',
      useCase: 'quality-extraction',
      type: 'built-in',
      config: {
        maxDepth: 6,
        maxConcurrency: 3,
        timeout: 30000,
        maxArticlesPerHub: 200,
        followLinks: true,
        extractContent: true,
        extractMetadata: true,
        validateContent: true,
        prioritizeHubDiscovery: false,
        retryStrategy: {
          maxRetries: 3,
          backoffMultiplier: 2.0
        },
        filters: {
          skipKnownUrls: false,
          requireMinimumQuality: true,
          minContentLength: 500
        },
        context: {
          strategy: 'thorough',
          goal: 'extract'
        }
      }
    });

    // Template 3: Update Check
    this.templates.set('update-check', {
      name: 'update-check',
      description: 'Revisit known hubs for new content',
      useCase: 'update',
      type: 'built-in',
      config: {
        maxDepth: 3,
        maxConcurrency: 5,
        timeout: 10000,
        maxArticlesPerHub: 50,
        followLinks: false,
        extractContent: true,
        prioritizeHubDiscovery: false,
        targetKnownHubs: true,
        retryStrategy: {
          maxRetries: 2,
          backoffMultiplier: 1.5
        },
        filters: {
          skipKnownUrls: true,
          onlyNewArticles: true,
          checkLastModified: true
        },
        context: {
          strategy: 'balanced',
          goal: 'update'
        }
      }
    });

    // Template 4: Gap Filling
    this.templates.set('gap-filling', {
      name: 'gap-filling',
      description: 'Find missing articles in sparse coverage areas',
      useCase: 'gap-fill',
      type: 'built-in',
      config: {
        maxDepth: 4,
        maxConcurrency: 4,
        timeout: 15000,
        maxArticlesPerHub: 100,
        followLinks: true,
        extractContent: true,
        prioritizeHubDiscovery: true,
        targetSparseAreas: true,
        retryStrategy: {
          maxRetries: 2,
          backoffMultiplier: 1.75
        },
        filters: {
          skipKnownUrls: true,
          targetLowCoverageHubs: true,
          minGapSize: 10
        },
        context: {
          strategy: 'balanced',
          goal: 'fill-gaps'
        }
      }
    });

    // Template 5: Monitoring
    this.templates.set('monitoring', {
      name: 'monitoring',
      description: 'Lightweight monitoring of breaking news hubs',
      useCase: 'monitoring',
      type: 'built-in',
      config: {
        maxDepth: 1,
        maxConcurrency: 8,
        timeout: 3000,
        maxArticlesPerHub: 10,
        followLinks: false,
        extractContent: false,
        prioritizeHubDiscovery: false,
        targetBreakingNews: true,
        retryStrategy: {
          maxRetries: 1,
          backoffMultiplier: 1.0
        },
        filters: {
          skipKnownUrls: true,
          onlyRealtimeHubs: true
        },
        context: {
          strategy: 'fast',
          goal: 'monitor'
        }
      }
    });

    this.logger.log?.('[Strategy]', `Initialized ${this.templates.size} built-in templates`);
  }

  _validateTemplateConfig(config) {
    const validated = {
      maxDepth: config.maxDepth || 3,
      maxConcurrency: config.maxConcurrency || 5,
      timeout: config.timeout || 10000,
      maxArticlesPerHub: config.maxArticlesPerHub || 100,
      followLinks: config.followLinks !== false,
      extractContent: config.extractContent !== false,
      prioritizeHubDiscovery: config.prioritizeHubDiscovery || false,
      retryStrategy: {
        maxRetries: config.retryStrategy?.maxRetries || 2,
        backoffMultiplier: config.retryStrategy?.backoffMultiplier || 1.5
      },
      filters: config.filters || {},
      context: config.context || {}
    };

    // Validate ranges
    if (validated.maxDepth < 1 || validated.maxDepth > 10) {
      throw new Error('maxDepth must be between 1 and 10');
    }
    if (validated.maxConcurrency < 1 || validated.maxConcurrency > 20) {
      throw new Error('maxConcurrency must be between 1 and 20');
    }
    if (validated.timeout < 1000 || validated.timeout > 60000) {
      throw new Error('timeout must be between 1000 and 60000');
    }

    return validated;
  }

  close() {
    this.templates.clear();
    this.userTemplates.clear();
  }
}

module.exports = { CrawlStrategyTemplates };
