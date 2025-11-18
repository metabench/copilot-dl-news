"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { findProjectRoot } = require("../../../utils/project-root");

function safeReadFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const payload = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return yaml.load(payload);
  }
  return JSON.parse(payload);
}

function toRelative(rootDir, absolutePath) {
  if (!absolutePath) return null;
  const rel = path.relative(rootDir, absolutePath);
  return rel && rel !== "" ? rel.replace(/\\/g, "/") : path.basename(absolutePath);
}

function createPropertyKey(...segments) {
  return segments
    .filter(Boolean)
    .map((segment) => String(segment).trim())
    .filter(Boolean)
    .join(".");
}

function buildPropertyDescription(base, extra) {
  if (base && extra) return `${base} • ${extra}`;
  return base || extra || null;
}

function mapOverrides(overrides = {}) {
  return Object.entries(overrides).map(([key, value]) => ({ key, value }));
}

function buildStepProperty(step, index, sourceLabel) {
  const key = createPropertyKey("sequence", "steps", step.id || index + 1);
  const overrides = step.overrides && Object.keys(step.overrides).length ? step.overrides : null;
  return {
    key,
    label: step.label || step.operation || `Step ${index + 1}`,
    path: key,
    value: step.operation,
    unit: step.startUrl,
    source: sourceLabel,
    description: buildPropertyDescription(step.description, overrides ? `Overrides: ${Object.keys(step.overrides).join(", ")}` : null),
    behaviorSummary: overrides ? JSON.stringify(step.overrides) : null,
    status: step.continueOnError ? { level: "info", text: "resilient" } : { level: "ok", text: "strict" }
  };
}

function buildDefaultProperties(defaults = {}, sourceLabel) {
  const shared = defaults.sharedOverrides || {};
  const baseSection = {
    key: "global-basics",
    title: "Baseline",
    description: "Primary runner defaults",
    properties: [
      {
        key: "defaults.mode",
        label: "Mode",
        path: "mode",
        value: defaults.mode || "sequence",
        source: sourceLabel,
        description: "Execution mode",
        validation: { level: "info", text: defaults.mode || "sequence" }
      },
      {
        key: "defaults.sequence",
        label: "Sequence",
        path: "sequence",
        value: defaults.sequence,
        source: sourceLabel,
        behaviorSummary: `Default sequence: ${defaults.sequence}`
      },
      {
        key: "defaults.startUrl",
        label: "Start URL",
        path: "startUrl",
        value: defaults.startUrl,
        source: sourceLabel,
        description: "Global seed"
      },
      {
        key: "defaults.cadence",
        label: "Cadence",
        path: "cadenceMinutes",
        value: defaults.cadenceMinutes,
        unit: "minutes",
        source: sourceLabel,
        description: "Suggested rerun cadence"
      }
    ]
  };

  const sharedSection = {
    key: "global-shared",
    title: "Shared Overrides",
    description: "Defaults applied to every crawl",
    properties: mapOverrides(shared).map(({ key, value }) => ({
      key: createPropertyKey("defaults", "shared", key),
      label: key,
      path: createPropertyKey("sharedOverrides", key),
      value,
      source: sourceLabel,
      description: "Global default override",
      status: { level: "info", text: "default" }
    }))
  };

  return [baseSection, sharedSection];
}

function buildRunnerOverrideProperties(runner = {}, defaults = {}, runnerLabel, defaultLabel) {
  const shared = runner.sharedOverrides || {};
  const defaultShared = defaults.sharedOverrides || {};
  const properties = mapOverrides(shared).map(({ key, value }) => {
    const defaultValue = defaultShared[key];
    const matchesDefault = defaultValue === value;
    return {
      key: createPropertyKey("runner", "shared", key),
      label: key,
      path: createPropertyKey("sharedOverrides", key),
      value,
      source: runnerLabel,
      description: matchesDefault ? "Matches defaults" : `Overrides default (${defaultValue})`,
      isOverride: !matchesDefault,
      fallbackSource: defaultLabel,
      status: matchesDefault ? { level: "info", text: "default" } : { level: "accent", text: "override" }
    };
  });

  return [
    {
      key: "runner-shared",
      title: "Runner Overrides",
      description: "Values from crawl-runner.json",
      properties
    }
  ];
}

function buildSequenceSections(sequence, sourceLabel) {
  if (!sequence) {
    return [];
  }
  const sections = [];
  const overridesList = mapOverrides(sequence.sharedOverrides || {});
  if (overridesList.length) {
    sections.push({
      key: "sequence-shared",
      title: "Sequence Shared Overrides",
      description: "Overrides merged into each step",
      properties: overridesList.map(({ key, value }) => ({
        key: createPropertyKey("sequence", "shared", key),
        label: key,
        path: createPropertyKey("sharedOverrides", key),
        value,
        source: sourceLabel,
        description: "Sequence-level override",
        isOverride: true,
        status: { level: "accent", text: "sequence" }
      }))
    });
  }
  sections.push({
    key: "sequence-steps",
    title: "Sequence Steps",
    description: "Operational flow",
    properties: (sequence.steps || []).map((step, index) => buildStepProperty(step, index, sourceLabel))
  });
  return sections;
}

function mergeBehaviors(runner = {}) {
  const shared = runner.sharedOverrides || {};
  const behaviors = [];
  if (shared.concurrency != null) {
    behaviors.push({
      key: "behavior.concurrency",
      label: "Host Concurrency",
      description: "Parallel fetch budget per host",
      scope: "host",
      mode: "throttle",
      limits: { concurrency: `${shared.concurrency} requests/host` },
      derivedFrom: ["crawl-runner.json#sharedOverrides.concurrency"],
      status: { level: "ok", text: "active" },
      targetProperty: createPropertyKey("runner", "shared", "concurrency")
    });
  }
  if (shared.maxDownloads != null) {
    behaviors.push({
      key: "behavior.maxDownloads",
      label: "Download Budget",
      description: "Max downloads before stopping",
      scope: "crawl",
      mode: "budget",
      limits: { maxDownloads: shared.maxDownloads },
      derivedFrom: ["crawl-runner.json#sharedOverrides.maxDownloads"],
      status: { level: "info", text: "cap" },
      targetProperty: createPropertyKey("runner", "shared", "maxDownloads")
    });
  }
  if (shared.maxDepth != null) {
    behaviors.push({
      key: "behavior.depth",
      label: "Depth Limit",
      description: "Maximum traversal depth",
      scope: "crawl",
      mode: "limit",
      limits: { maxDepth: shared.maxDepth },
      derivedFrom: ["crawl-runner.json#sharedOverrides.maxDepth"],
      status: { level: "info", text: "limit" },
      targetProperty: createPropertyKey("runner", "shared", "maxDepth")
    });
  }
  behaviors.push({
    key: "behavior.robots",
    label: "Robots Compliance",
    description: "Respect robots.txt disallow rules",
    scope: "host",
    mode: "policy",
    cues: ["robots:allow", "robots:disallow"],
    derivedFrom: ["crawl-runner.json"],
    status: { level: "ok", text: "enabled" }
  });
  return behaviors;
}

function loadSequenceVariants(sequenceDir, sequenceName, rootDir) {
  if (!sequenceDir || !fs.existsSync(sequenceDir)) {
    return [];
  }
  const files = fs.readdirSync(sequenceDir);
  return files
    .filter((file) => {
      if (!sequenceName) return true;
      return file.startsWith(sequenceName);
    })
    .filter((file) => /(\.json|\.ya?ml)$/i.test(file))
    .map((file) => {
      const absolute = path.join(sequenceDir, file);
      const data = safeReadFile(absolute);
      if (!data) return null;
      return {
        key: file.replace(/\.(json|ya?ml)$/i, ""),
        source: toRelative(rootDir, absolute),
        data
      };
    })
    .filter(Boolean);
}

function buildProfiles({ sequences, runnerConfig, defaultConfig }) {
  if (!Array.isArray(sequences) || sequences.length === 0) {
    return runnerConfig ? [buildRunnerProfile(runnerConfig, null)] : [];
  }
  return sequences.map((entry) => buildRunnerProfile(runnerConfig, entry));
}

function buildRunnerProfile(runnerConfig, sequenceEntry) {
  const mergedOverrides = {
    ...(runnerConfig.sharedOverrides || {}),
    ...((sequenceEntry && sequenceEntry.data && sequenceEntry.data.sharedOverrides) || {})
  };
  const behaviors = mergeBehaviors({ sharedOverrides: mergedOverrides });
  return {
    key: (sequenceEntry && sequenceEntry.key) || "runner",
    name: (sequenceEntry && (sequenceEntry.data.name || sequenceEntry.data.label)) || runnerConfig.sequence || "sequence",
    host: sequenceEntry && sequenceEntry.data && sequenceEntry.data.host,
    startUrl: (sequenceEntry && sequenceEntry.data && sequenceEntry.data.startUrl) || runnerConfig.startUrl,
    version: sequenceEntry && sequenceEntry.data && sequenceEntry.data.version,
    source: sequenceEntry && sequenceEntry.source,
    stats: {
      steps: sequenceEntry && sequenceEntry.data && Array.isArray(sequenceEntry.data.steps) ? sequenceEntry.data.steps.length : 0,
      overrides: Object.keys(mergedOverrides).length,
      behaviors: behaviors.length
    },
    sharedOverrides: mergedOverrides,
    behaviors
  };
}

function buildDiffSummary({ defaultConfig = {}, runnerConfig = {}, sequences = [], defaultLabel, runnerLabel }) {
  const diffs = [];
  const defaultOverrides = defaultConfig.sharedOverrides || {};
  const runnerOverrides = runnerConfig.sharedOverrides || {};
  const unionKeys = new Set([...Object.keys(defaultOverrides), ...Object.keys(runnerOverrides)]);
  unionKeys.forEach((key) => {
    const baseValue = defaultOverrides[key];
    const overrideValue = runnerOverrides[key];
    if (baseValue === undefined && overrideValue === undefined) {
      return;
    }
    diffs.push({
      key: createPropertyKey("diff", "runner", key),
      label: key,
      scope: "runner",
      source: runnerLabel,
      defaultValue: baseValue,
      overrideValue,
      note: baseValue === overrideValue ? "Matches defaults" : "Runner override",
      focusProperty: createPropertyKey("runner", "shared", key),
      status: baseValue === overrideValue ? { level: "info", text: "default" } : { level: "accent", text: "override" }
    });
  });

  sequences.forEach((entry) => {
    const seqOverrides = (entry.data && entry.data.sharedOverrides) || {};
    Object.entries(seqOverrides).forEach(([key, value]) => {
      diffs.push({
        key: createPropertyKey("diff", entry.key, key),
        label: `${entry.key}:${key}`,
        scope: "sequence",
        source: entry.source,
        defaultValue: runnerOverrides[key] != null ? runnerOverrides[key] : defaultOverrides[key],
        overrideValue: value,
        note: `Sequence override in ${entry.key}`,
        focusProperty: createPropertyKey("sequence", "shared", key),
        status: { level: "accent", text: "sequence" }
      });
    });
  });

  return diffs;
}

function buildTimeline(sequenceEntry) {
  if (!sequenceEntry || !Array.isArray(sequenceEntry.steps)) {
    return [];
  }
  return sequenceEntry.steps.map((step, index) => ({
    id: step.id || `step-${index + 1}`,
    label: step.label || step.operation || `Step ${index + 1}`,
    operation: step.operation,
    summary: step.description || null,
    overrides: step.overrides || null,
    impact: {
      continueOnError: step.continueOnError ? "tolerant" : "strict"
    },
    status: step.continueOnError ? { level: "info", text: "resilient" } : { level: "ok", text: "strict" },
    focusProperty: createPropertyKey("sequence", "steps", step.id || index + 1)
  }));
}

function buildGroups({ runnerConfig, defaultConfig, sequenceEntry, runnerLabel, defaultLabel }) {
  const groups = [];
  groups.push({
    key: "global-defaults",
    label: "Global Defaults",
    description: "Values from config/defaults",
    stats: {
      overrides: Object.keys(defaultConfig.sharedOverrides || {}).length,
      summary: defaultConfig.sequence ? `Sequence ${defaultConfig.sequence}` : "Defaults"
    },
    sections: buildDefaultProperties(defaultConfig, defaultLabel)
  });

  groups.push({
    key: "shared-overrides",
    label: "Shared Overrides",
    description: "crawl-runner.json",
    stats: {
      overrides: Object.keys(runnerConfig.sharedOverrides || {}).length,
      summary: runnerConfig.sequence ? `Mode ${runnerConfig.mode || "sequence"}` : "Runner"
    },
    sections: buildRunnerOverrideProperties(runnerConfig, defaultConfig, runnerLabel, defaultLabel)
  });

  groups.push({
    key: "sequence-steps",
    label: "Sequence Steps",
    description: "Sequence configuration",
    stats: {
      overrides: sequenceEntry && sequenceEntry.data && sequenceEntry.data.sharedOverrides ? Object.keys(sequenceEntry.data.sharedOverrides).length : 0,
      summary: sequenceEntry && sequenceEntry.data && sequenceEntry.data.steps ? `${sequenceEntry.data.steps.length} steps` : "No steps"
    },
    sections: buildSequenceSections(sequenceEntry && sequenceEntry.data, sequenceEntry && sequenceEntry.source)
  });

  return groups;
}

function buildWorkspacePayload(options = {}) {
  const rootDir = options.rootDir || findProjectRoot(__dirname);
  const runnerPath = options.runnerPath || path.join(rootDir, "config", "crawl-runner.json");
  const defaultsPath = options.defaultsPath || path.join(rootDir, "config", "defaults.crawl-runner.json");
  const sequencesDir = options.sequencesDir || path.join(rootDir, "config", "crawl-sequences");

  const runnerConfig = safeReadFile(runnerPath) || {};
  const defaultConfig = safeReadFile(defaultsPath) || {};
  const sequenceName = runnerConfig.sequence || defaultConfig.sequence || null;
  const sequences = loadSequenceVariants(sequencesDir, sequenceName, rootDir);
  const primarySequence = sequences.find((entry) => entry && entry.data && entry.data.host) || sequences[0] || null;

  const groups = buildGroups({
    runnerConfig,
    defaultConfig,
    sequenceEntry: primarySequence,
    runnerLabel: toRelative(rootDir, runnerPath),
    defaultLabel: toRelative(rootDir, defaultsPath)
  });

  const timeline = buildTimeline(primarySequence && primarySequence.data);
  const behaviors = mergeBehaviors(runnerConfig);
  const diffSummary = buildDiffSummary({
    defaultConfig,
    runnerConfig,
    sequences,
    defaultLabel: toRelative(rootDir, defaultsPath),
    runnerLabel: toRelative(rootDir, runnerPath)
  });

  const sequenceProfiles = buildProfiles({ sequences, runnerConfig, defaultConfig });

  return {
    groups,
    sequenceProfile: sequenceProfiles[0] || {},
    sequenceProfiles,
    timeline,
    diffSummary,
    behaviors
  };
}

module.exports = {
  buildWorkspacePayload
};
