const fs = require('fs');
const path = require('path');
const { DecisionConfigSet } = require('./DecisionConfigSet');

const PRODUCTION_PATHS = {
  priorityConfig: 'config/priority-config.json',
  decisionTrees: 'config/decision-trees',
  classificationPatterns: 'config/classification-patterns.json'
};

const CONFIG_SETS_DIR = 'config/decision-sets';

class DecisionConfigSetRepository {
  constructor({ rootDir = process.cwd(), configSetsDir = CONFIG_SETS_DIR, productionPaths = PRODUCTION_PATHS } = {}) {
    this.rootDir = rootDir;
    this.configSetsDir = configSetsDir;
    this.productionPaths = productionPaths;
  }

  getSetPath(slug) {
    return path.join(this.rootDir, this.configSetsDir, `${slug}.json`);
  }

  loadSync(slug) {
    const setPath = this.getSetPath(slug);
    if (!fs.existsSync(setPath)) {
      throw new Error(`Config set not found: ${slug}`);
    }
    const spec = JSON.parse(fs.readFileSync(setPath, 'utf8'));
    return new DecisionConfigSet(spec);
  }

  async load(slug) {
    return this.loadSync(slug);
  }

  async list() {
    const setsDir = path.join(this.rootDir, this.configSetsDir);
    if (!fs.existsSync(setsDir)) return [];

    const files = fs.readdirSync(setsDir).filter(f => f.endsWith('.json'));
    const sets = [];

    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(setsDir, file), 'utf8'));
        sets.push({
          slug: content.slug,
          name: content.name,
          description: content.description,
          createdAt: content.metadata?.createdAt,
          modifiedAt: content.metadata?.modifiedAt,
          isProduction: content.metadata?.isProduction || false,
          parentSlug: content.parentSlug
        });
      } catch (e) {
        // Skip invalid files
      }
    }

    return sets.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  }

  async save(configSet) {
    const setsDir = path.join(this.rootDir, this.configSetsDir);
    if (!fs.existsSync(setsDir)) {
      fs.mkdirSync(setsDir, { recursive: true });
    }

    configSet.metadata.modifiedAt = new Date().toISOString();
    const setPath = this.getSetPath(configSet.slug);
    fs.writeFileSync(setPath, JSON.stringify(configSet.toJSON(), null, 2), 'utf8');
    return setPath;
  }

  async delete(configSet) {
    if (configSet.metadata.isProduction) {
      throw new Error('Cannot delete production config set');
    }
    const setPath = this.getSetPath(configSet.slug);
    if (fs.existsSync(setPath)) {
      fs.unlinkSync(setPath);
    }
  }

  async fromProduction(name) {
    const spec = {
      name,
      slug: DecisionConfigSet.slugify(name),
      description: `Snapshot of production config at ${new Date().toISOString()}`,
      priorityConfig: {},
      decisionTrees: {},
      classificationPatterns: {},
      articleSignals: {},
      metadata: {
        isProduction: true,
        createdAt: new Date().toISOString(),
        notes: ['Loaded from production files']
      }
    };

    const priorityPath = path.join(this.rootDir, this.productionPaths.priorityConfig);
    if (fs.existsSync(priorityPath)) {
      spec.priorityConfig = JSON.parse(fs.readFileSync(priorityPath, 'utf8'));
    }

    const treesDir = path.join(this.rootDir, this.productionPaths.decisionTrees);
    if (fs.existsSync(treesDir)) {
      const treeFiles = fs.readdirSync(treesDir).filter(f => f.endsWith('.json') && !f.includes('schema'));
      for (const file of treeFiles) {
        const treeName = path.basename(file, '.json');
        const treePath = path.join(treesDir, file);
        spec.decisionTrees[treeName] = JSON.parse(fs.readFileSync(treePath, 'utf8'));
      }
    }

    const patternsPath = path.join(this.rootDir, this.productionPaths.classificationPatterns);
    if (fs.existsSync(patternsPath)) {
      spec.classificationPatterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
    }

    spec.features = spec.priorityConfig.features || {};
    return new DecisionConfigSet(spec);
  }
}

function createDefaultDecisionConfigSetRepository() {
  return new DecisionConfigSetRepository();
}

module.exports = {
  DecisionConfigSetRepository,
  createDefaultDecisionConfigSetRepository,
  PRODUCTION_PATHS,
  CONFIG_SETS_DIR
};
