const fs = require('fs');
const path = require('path');
const { DecisionConfigSetRepository, PRODUCTION_PATHS } = require('./DecisionConfigSetRepository');

class DecisionConfigPromotionService {
  constructor({
    repository = new DecisionConfigSetRepository(),
    rootDir = process.cwd(),
    backupDir = path.join(process.cwd(), 'data/backups/config-snapshots'),
    productionPaths = PRODUCTION_PATHS
  } = {}) {
    this.repository = repository;
    this.rootDir = rootDir;
    this.backupDir = backupDir;
    this.productionPaths = productionPaths;
  }

  async promote(configSet, { backup = true } = {}) {
    let backupPath = null;

    if (backup) {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(this.backupDir, `production-backup-${timestamp}.json`);
      const currentProd = await this.repository.fromProduction('backup');
      fs.writeFileSync(backupPath, JSON.stringify(currentProd.toJSON(), null, 2), 'utf8');
    }

    this.#writePriorityConfig(configSet.priorityConfig);
    this.#writeDecisionTrees(configSet.decisionTrees);
    this.#writeClassificationPatterns(configSet.classificationPatterns);

    configSet.metadata.isProduction = true;
    configSet.metadata.notes = configSet.metadata.notes || [];
    configSet.metadata.notes.push(`Promoted to production at ${new Date().toISOString()}`);
    await this.repository.save(configSet);

    return { backupPath };
  }

  #writePriorityConfig(priorityConfig) {
    const priorityPath = path.join(this.rootDir, this.productionPaths.priorityConfig);
    const dir = path.dirname(priorityPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(priorityPath, JSON.stringify(priorityConfig, null, 2), 'utf8');
  }

  #writeDecisionTrees(decisionTrees) {
    const treesDir = path.join(this.rootDir, this.productionPaths.decisionTrees);
    if (!fs.existsSync(treesDir)) {
      fs.mkdirSync(treesDir, { recursive: true });
    }
    for (const [treeName, treeConfig] of Object.entries(decisionTrees)) {
      const treePath = path.join(treesDir, `${treeName}.json`);
      fs.writeFileSync(treePath, JSON.stringify(treeConfig, null, 2), 'utf8');
    }
  }

  #writeClassificationPatterns(classificationPatterns) {
    if (!classificationPatterns || Object.keys(classificationPatterns).length === 0) return;
    const patternsPath = path.join(this.rootDir, this.productionPaths.classificationPatterns);
    const dir = path.dirname(patternsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(patternsPath, JSON.stringify(classificationPatterns, null, 2), 'utf8');
  }
}

module.exports = { DecisionConfigPromotionService };
