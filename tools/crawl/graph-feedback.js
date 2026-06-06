#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');

const {
  DEFAULT_DB_PATH,
  buildReadOnlyGraphFeedbackPlan,
} = require('./lib/graph-feedback-loader');
const {
  MAX_PER_HOST_LIMIT,
  MAX_SAMPLE_LIMIT,
  normalizeDomains,
} = require('./lib/graph-feedback-planner');
const {
  DEFAULT_PROFILE_COMPATIBILITY_NAMES,
  DEFAULT_PROFILE_DIR,
  buildProfileCompatibilitySummary,
  loadCrawlProfileHostPlan,
} = require('./lib/profile-hosts');

const ARTIFACT_SCHEMA_VERSION = 1;
const MAX_ARTIFACT_URL_LENGTH = 4096;
const MAX_ARTIFACT_BYTES = 256 * 1024;
const STALE_ARTIFACT_WARNING_DAYS = 7;
const STALE_ARTIFACT_WARNING_MS = STALE_ARTIFACT_WARNING_DAYS * 24 * 60 * 60 * 1000;
const MAX_OPERATOR_REPORT_PROFILES = 25;

function parseArgs(argv) {
  const opts = {
    domains: [],
    dbPath: DEFAULT_DB_PATH,
    perHostLimit: undefined,
    sampleLimit: undefined,
    fetchedOnly: undefined,
    includeFetched: undefined,
    staleBefore: undefined,
    staleFetchedBefore: undefined,
    generatedAt: undefined,
    mode: 'full',
    outPath: undefined,
    artifactPath: undefined,
    profileNames: [],
    profileDir: DEFAULT_PROFILE_DIR,
    profileSummary: false,
    profilePreflight: false,
    profileWorkflow: false,
    operatorReport: false,
    allCommonProfiles: false,
    reportFormat: 'json',
    reportCommands: 'full',
    reportMaxProfiles: undefined,
    preflightFormat: 'json',
    workflowFormat: 'json',
    recipe: false,
    compareHosts: false,
    pretty: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = flag => {
      const value = argv[++index];
      if (value === undefined || String(value).startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }
      return value;
    };

    switch (token) {
      case '--help':
      case '-h':
        opts.help = true;
        break;
      case '--json':
        break;
      case '--fast':
        opts.mode = 'fast';
        break;
      case '--mode':
        opts.mode = parseMode(next(token));
        break;
      case '--pretty':
        opts.pretty = true;
        break;
      case '--out':
      case '--output':
        opts.outPath = next(token);
        break;
      case '--from-artifact':
      case '--artifact':
      case '--input':
        opts.artifactPath = next(token);
        break;
      case '--recipe':
      case '--preview-commands':
        opts.recipe = true;
        break;
      case '--profile':
        opts.profileNames.push(next(token));
        break;
      case '--profile-dir':
        opts.profileDir = next(token);
        break;
      case '--profile-summary':
      case '--profiles-summary':
        opts.profileSummary = true;
        break;
      case '--profile-preflight':
      case '--preflight':
        opts.profilePreflight = true;
        break;
      case '--profile-workflow':
      case '--workflow-checklist':
      case '--workflow':
        opts.profileWorkflow = true;
        break;
      case '--operator-report':
      case '--profile-report':
      case '--cheat-sheet':
        opts.operatorReport = true;
        break;
      case '--all-common-profiles':
        opts.allCommonProfiles = true;
        break;
      case '--report-format':
      case '--format':
        opts.reportFormat = parseReportFormat(next(token));
        break;
      case '--report-commands':
        opts.reportCommands = parseReportCommands(next(token));
        break;
      case '--report-max-profiles':
        opts.reportMaxProfiles = parseReportMaxProfiles(next(token));
        break;
      case '--preflight-format':
      case '--profile-preflight-format':
        opts.preflightFormat = parsePreflightFormat(next(token));
        break;
      case '--workflow-format':
      case '--profile-workflow-format':
        opts.workflowFormat = parseWorkflowFormat(next(token));
        break;
      case '--compare-hosts':
      case '--host-check':
        opts.compareHosts = true;
        break;
      case '--domain':
        opts.domains.push(next(token));
        break;
      case '--domains':
        opts.domains.push(...splitCsv(next(token)));
        break;
      case '--db':
        opts.dbPath = next(token);
        break;
      case '--limit':
      case '--per-host-limit':
        opts.perHostLimit = Number(next(token));
        break;
      case '--sample-limit':
        opts.sampleLimit = Number(next(token));
        break;
      case '--fetched-only':
        opts.fetchedOnly = true;
        break;
      case '--include-fetched':
        opts.includeFetched = parseBoolean(next(token));
        break;
      case '--no-include-fetched':
        opts.includeFetched = false;
        break;
      case '--stale-before':
        opts.staleBefore = next(token);
        break;
      case '--stale-fetched-before':
        opts.staleFetchedBefore = next(token);
        break;
      case '--generated-at':
        opts.generatedAt = next(token);
        break;
      default:
        if (token.startsWith('-')) throw new Error(`Unknown flag: ${token}`);
        opts.domains.push(...splitCsv(token));
    }
  }

  opts.domains = [...new Set(opts.domains.map(item => String(item || '').trim()).filter(Boolean))];
  opts.profileNames = opts.profileNames.map(item => String(item || '').trim()).filter(Boolean);
  return opts;
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);

  if (opts.help) {
    const text = usage();
    (deps.stdout || process.stdout).write(text);
    return { ok: true, help: true };
  }

  if (opts.profileWorkflow) {
    validateProfileWorkflowOptions(opts);
    const profilePlan = await loadArtifactProfilePlan(opts.profileNames[0], opts, deps);
    const workflowBuilder = deps.buildProfileWorkflowChecklist || buildProfileWorkflowChecklist;
    const workflow = await workflowBuilder({
      profilePlan,
      artifactPath: opts.artifactPath,
      generatedAt: opts.generatedAt,
      profileDir: opts.profileDir,
      fs: deps.fs,
    });
    const body = opts.workflowFormat === 'markdown'
      ? renderProfileWorkflowChecklistMarkdown(workflow)
      : JSON.stringify(workflow, null, opts.pretty ? 2 : 0);
    const text = body.endsWith('\n') ? body : `${body}\n`;
    if (opts.outPath) {
      const artifactWriter = opts.workflowFormat === 'markdown'
        ? (deps.writeTextArtifact || writeTextArtifact)
        : (deps.writeJsonArtifact || writeJsonArtifact);
      await artifactWriter(opts.outPath, text, deps);
    }
    (deps.stdout || process.stdout).write(text);
    return workflow;
  }

  if (opts.operatorReport) {
    validateOperatorReportOptions(opts);
    const reportBuilder = deps.buildOperatorReport || buildOperatorReport;
    const report = await reportBuilder({
      profileNames: opts.profileNames,
      allCommonProfiles: opts.allCommonProfiles,
      profileDir: opts.profileDir,
      artifactPath: opts.artifactPath,
      generatedAt: opts.generatedAt,
      reportCommands: opts.reportCommands,
      reportMaxProfiles: opts.reportMaxProfiles,
      fs: deps.fs,
      profileFs: deps.profileFs,
    });
    const body = opts.reportFormat === 'markdown'
      ? renderOperatorReportMarkdown(report)
      : JSON.stringify(report, null, opts.pretty ? 2 : 0);
    const text = body.endsWith('\n') ? body : `${body}\n`;
    if (opts.outPath) {
      const artifactWriter = deps.writeTextArtifact || writeTextArtifact;
      await artifactWriter(opts.outPath, text, deps);
    }
    (deps.stdout || process.stdout).write(text);
    return report;
  }

  if (opts.profilePreflight) {
    if (opts.recipe || opts.compareHosts || opts.profileSummary) {
      throw new Error('--profile-preflight cannot be combined with --recipe, --compare-hosts, or --profile-summary');
    }
    if (opts.profileNames.length !== 1) {
      throw new Error('--profile-preflight requires exactly one --profile');
    }
    const profilePlan = await loadArtifactProfilePlan(opts.profileNames[0], opts, deps);
    const requestedDomains = resolveProfileAwareDomains(opts.domains, profilePlan, {
      requireStaticHosts: false,
    });
    const preflightBuilder = deps.buildProfilePreflightReport || buildProfilePreflightReport;
    const preflight = await preflightBuilder({
      artifactPath: opts.artifactPath,
      profilePlan,
      domains: requestedDomains,
      explicitDomains: opts.domains,
      generatedAt: opts.generatedAt,
      profileDir: opts.profileDir,
      fs: deps.fs,
    });
    const body = opts.preflightFormat === 'text'
      ? renderProfilePreflightText(preflight)
      : JSON.stringify(preflight, null, opts.pretty ? 2 : 0);
    const text = body.endsWith('\n') ? body : `${body}\n`;
    if (opts.outPath) {
      const artifactWriter = opts.preflightFormat === 'text'
        ? (deps.writeTextArtifact || writeTextArtifact)
        : (deps.writeJsonArtifact || writeJsonArtifact);
      await artifactWriter(opts.outPath, text, deps);
    }
    (deps.stdout || process.stdout).write(text);
    return preflight;
  }

  if (opts.profileSummary) {
    if (opts.artifactPath || opts.outPath || opts.recipe || opts.compareHosts || opts.profilePreflight) {
      throw new Error('--profile-summary cannot be combined with artifact, recipe, compare, preflight, or output flags');
    }
    const summaryBuilder = deps.buildProfileCompatibilitySummary || buildProfileCompatibilitySummary;
    const summary = await summaryBuilder(opts.profileNames, {
      profileDir: opts.profileDir,
      fs: deps.profileFs,
      generatedAt: opts.generatedAt,
    });
    const json = JSON.stringify(summary, null, opts.pretty ? 2 : 0);
    (deps.stdout || process.stdout).write(`${json}\n`);
    return summary;
  }

  if (opts.compareHosts && !opts.artifactPath) {
    throw new Error('--compare-hosts requires --from-artifact');
  }

  if (opts.profileNames.length && !opts.artifactPath) {
    throw new Error('--profile is only supported with --from-artifact, --profile-preflight, or --profile-summary');
  }

  if (opts.artifactPath) {
    if (opts.profileNames.length > 1) {
      throw new Error('--from-artifact accepts at most one --profile');
    }
    if (opts.recipe && opts.outPath) {
      throw new Error('--recipe cannot be combined with --out');
    }
    if (opts.compareHosts && opts.recipe) {
      throw new Error('--compare-hosts cannot be combined with --recipe');
    }
    if (opts.compareHosts && opts.outPath) {
      throw new Error('--compare-hosts cannot be combined with --out');
    }
    const profilePlan = opts.profileNames.length
      ? await loadArtifactProfilePlan(opts.profileNames[0], opts, deps)
      : null;
    const requestedDomains = resolveProfileAwareDomains(opts.domains, profilePlan, {
      requireStaticHosts: !opts.compareHosts,
    });
    if (opts.compareHosts && !requestedDomains.length && !profilePlan) {
      throw new Error('--compare-hosts requires --domain or --domains');
    }
    if (opts.compareHosts) {
      const hostComparisonBuilder = deps.buildArtifactHostComparison || buildArtifactHostComparison;
      const hostComparison = await hostComparisonBuilder(opts.artifactPath, {
        domains: requestedDomains,
        explicitDomains: opts.domains,
        generatedAt: opts.generatedAt,
        profilePlan,
        fs: deps.fs,
      });
      const json = JSON.stringify(hostComparison, null, opts.pretty ? 2 : 0);
      (deps.stdout || process.stdout).write(`${json}\n`);
      return hostComparison;
    }
    const artifactBuilder = deps.buildArtifactPlanningDryRun || buildArtifactPlanningDryRun;
    const artifactPlan = await artifactBuilder(opts.artifactPath, {
      domains: requestedDomains,
      generatedAt: opts.generatedAt,
      profilePlan,
      fs: deps.fs,
    });
    const output = opts.recipe
      ? buildArtifactWorkflowRecipe(artifactPlan, {
        artifactPath: opts.artifactPath,
        profilePlan,
        profileDir: opts.profileDir,
      })
      : artifactPlan;
    const json = JSON.stringify(output, null, opts.pretty ? 2 : 0);
    if (opts.outPath) {
      const artifactWriter = deps.writeJsonArtifact || writeJsonArtifact;
      await artifactWriter(opts.outPath, `${json}\n`, deps);
    }
    (deps.stdout || process.stdout).write(`${json}\n`);
    return output;
  }

  if (!opts.domains.length) {
    throw new Error('No domains supplied. Use --domain, --domains, or positional hostnames.');
  }

  const builder = deps.buildReadOnlyGraphFeedbackPlan || buildReadOnlyGraphFeedbackPlan;
  const plan = await builder(opts.domains, {
    dbPath: opts.dbPath,
    plannerOptions: {
      perHostLimit: opts.perHostLimit,
      sampleLimit: opts.sampleLimit,
      fetchedOnly: opts.fetchedOnly,
      includeFetched: opts.includeFetched,
      staleBefore: opts.staleBefore,
      staleFetchedBefore: opts.staleFetchedBefore,
      generatedAt: opts.generatedAt,
      mode: opts.mode,
    },
  });
  const json = JSON.stringify(plan, null, opts.pretty ? 2 : 0);
  if (opts.outPath) {
    const artifactWriter = deps.writeJsonArtifact || writeJsonArtifact;
    await artifactWriter(opts.outPath, `${json}\n`, deps);
  }
  (deps.stdout || process.stdout).write(`${json}\n`);
  return plan;
}

/**
 * Write a bounded graph-feedback JSON artifact for later dry-run planning.
 *
 * @param {string} outPath Destination file path supplied explicitly by the operator.
 * @param {string} json Complete JSON payload including trailing newline.
 * @param {object} [deps] Test seams for filesystem and path modules.
 * @returns {Promise<string>} Written path.
 */
async function writeJsonArtifact(outPath, json, deps = {}) {
  return writeTextArtifact(outPath, json, deps);
}

/**
 * Write a bounded graph-feedback text artifact for later operator review.
 *
 * @param {string} outPath Destination file path supplied explicitly by the operator.
 * @param {string} text Complete report payload including trailing newline.
 * @param {object} [deps] Test seams for filesystem and path modules.
 * @returns {Promise<string>} Written path.
 */
async function writeTextArtifact(outPath, text, deps = {}) {
  const normalizedPath = String(outPath || '').trim();
  if (!normalizedPath) {
    throw new Error('Expected artifact output path after --out');
  }

  const fsApi = deps.fs || fs;
  const pathApi = deps.path || path;
  await fsApi.mkdir(pathApi.dirname(normalizedPath), { recursive: true });
  await fsApi.writeFile(normalizedPath, text, 'utf8');
  return normalizedPath;
}

/**
 * Read and parse a saved graph-feedback artifact.
 *
 * @param {string} artifactPath Path supplied by --from-artifact.
 * @param {object} [deps] Test seams for filesystem APIs.
 * @returns {Promise<object>} Parsed JSON artifact.
 */
async function readJsonArtifact(artifactPath, deps = {}) {
  const { artifact } = await readGraphFeedbackArtifactFile(artifactPath, deps);
  return artifact;
}

/**
 * Read, size-check, parse, and annotate a saved graph-feedback artifact file.
 *
 * @param {string} artifactPath Path supplied by --from-artifact.
 * @param {object} [deps] Test seams for filesystem APIs.
 * @param {string} [deps.generatedAt] Reference time used for deterministic age evidence.
 * @returns {Promise<{artifact: object, evidence: object}>} Parsed artifact plus file-only evidence.
 */
async function readGraphFeedbackArtifactFile(artifactPath, deps = {}) {
  const normalizedPath = String(artifactPath || '').trim();
  if (!normalizedPath) {
    throw new Error('Expected graph-feedback artifact path after --from-artifact');
  }

  const fsApi = deps.fs || fs;
  const raw = await fsApi.readFile(normalizedPath, 'utf8');
  const rawText = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  const byteSize = Buffer.byteLength(rawText, 'utf8');
  if (byteSize > MAX_ARTIFACT_BYTES) {
    throw new Error(`Graph-feedback artifact ${normalizedPath} is ${byteSize} bytes; max supported size is ${MAX_ARTIFACT_BYTES} bytes`);
  }

  let artifact;
  try {
    artifact = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Invalid graph-feedback artifact JSON at ${normalizedPath}: ${err.message}`);
  }

  return {
    artifact,
    evidence: buildArtifactEvidence(artifact, {
      byteSize,
      referenceAt: deps.referenceAt || deps.generatedAt,
    }),
  };
}

/**
 * Build a file-only workflow checklist for the safe profile graph-feedback path.
 *
 * @param {object} options
 * @param {object} options.profilePlan File-only profile host plan.
 * @param {string} [options.artifactPath] Optional artifact path to inspect/use in commands.
 * @param {string} [options.generatedAt] Stable timestamp for tests.
 * @returns {Promise<object>} Bounded workflow checklist.
 */
async function buildProfileWorkflowChecklist(options = {}) {
  const profile = summarizeProfilePlan(options.profilePlan);
  if (!profile) {
    throw new Error('Profile workflow requires a profile plan');
  }

  const plannedHosts = normalizeDomains(profile.hosts || []);
  const profileIdentifier = profile.profileIdentifier || profile.profileName || profile.profilePath || '<profile-name>';
  const artifactPath = String(options.artifactPath || '').trim()
    || `tmp/graph-feedback-${slugifyProfileName(profileIdentifier)}.json`;
  const preflight = await buildProfilePreflightReport({
    artifactPath: options.artifactPath,
    profilePlan: options.profilePlan,
    domains: plannedHosts,
    generatedAt: options.generatedAt,
    profileDir: options.profileDir,
    fs: options.fs,
  });
  const checklist = buildProfileWorkflowChecklistCommands({
    profile,
    plannedHosts,
    artifactPath,
    profileDir: options.profileDir,
  });
  const caveats = [
    ...(preflight.caveats || []),
    'Stale artifacts are warnings in read-only preview/report modes; hard freshness rejection is reserved for future explicit live seeding.',
  ];

  if (!plannedHosts.length) {
    caveats.push('This profile has no static hosts, so the workflow omits artifact generation, strict validation, and profile dry-run preview commands.');
  }

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-profile-workflow',
    mode: 'profile-workflow-checklist',
    generatedAt: options.generatedAt || new Date().toISOString(),
    profile,
    plannedHosts,
    artifactPath,
    readiness: preflight.readiness,
    artifact: preflight.artifact,
    hostComparison: preflight.hostComparison,
    candidateCount: Number(preflight.candidateCount || 0),
    checklist,
    caveats: uniqueStrings(caveats),
    references: [
      'docs/sessions/2026-05-26-crawler-graph-feedback-loop/PLAN.md#recursive-backlog-status',
      'docs/sessions/2026-05-26-crawler-graph-feedback-loop/WORKING_NOTES.md',
      'docs/sessions/2026-05-26-crawler-graph-feedback-loop/FUTURE_LIVE_SEEDING_DESIGN.md',
      'docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md',
      'docs/workflows/graph-feedback-artifact-planning.md',
      'tools/crawl/AGENT.md',
    ],
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
  };
}

/**
 * Build a read-only planning dry run from a saved graph-feedback artifact.
 *
 * @param {string} artifactPath Saved artifact path.
 * @param {object} [options]
 * @param {string[]} [options.domains] Optional hosts that must exist in the artifact.
 * @param {string} [options.generatedAt] Stable timestamp for deterministic tests.
 * @returns {Promise<object>} Bounded planning dry-run JSON.
 */
async function buildArtifactPlanningDryRun(artifactPath, options = {}) {
  const { artifact, evidence } = await readGraphFeedbackArtifactFile(artifactPath, options);
  return buildArtifactPlanningDryRunFromPlan(artifact, {
    artifactPath,
    domains: options.domains,
    generatedAt: options.generatedAt,
    profilePlan: options.profilePlan,
    artifactEvidence: evidence,
  });
}

/**
 * Compare requested/planned hosts with hosts present in a saved artifact.
 *
 * This mode is intentionally file-only. It validates the artifact itself, then
 * reports exact host spelling differences without requiring the requested hosts
 * to match.
 *
 * @param {string} artifactPath Saved artifact path.
 * @param {object} [options]
 * @param {string[]} [options.domains] Planned/requested hosts to compare.
 * @param {string} [options.generatedAt] Stable timestamp for deterministic tests.
 * @returns {Promise<object>} Host comparison JSON.
 */
async function buildArtifactHostComparison(artifactPath, options = {}) {
  const { artifact, evidence } = await readGraphFeedbackArtifactFile(artifactPath, options);
  return buildArtifactHostComparisonFromPlan(artifact, {
    artifactPath,
    domains: options.domains,
    explicitDomains: options.explicitDomains,
    generatedAt: options.generatedAt,
    profilePlan: options.profilePlan,
    artifactEvidence: evidence,
  });
}

/**
 * Convert a graph-feedback artifact into a planning-only seed consideration view.
 *
 * @param {object} artifact Parsed graph-feedback artifact.
 * @param {object} [options]
 * @param {string} [options.artifactPath] Source path for operator context.
 * @param {string[]} [options.domains] Optional hosts that must exist in the artifact.
 * @param {string} [options.generatedAt] Stable timestamp for deterministic tests.
 * @returns {object} Bounded artifact-consumer dry-run JSON.
 */
function buildArtifactPlanningDryRunFromPlan(artifact, options = {}) {
  const validation = validateGraphFeedbackArtifact(artifact, options.domains || []);
  const domainsByHost = new Map((artifact.domains || []).map(item => [normalizeHost(item.host), item]));
  const selectedHosts = validation.selectedHosts.length ? validation.selectedHosts : validation.artifactHosts;
  const domainPlans = selectedHosts.map(host => buildArtifactDomainConsideration(
    domainsByHost.get(host),
    validation.limits.perHostLimit
  ));
  const candidateCount = domainPlans.reduce((total, item) => total + item.candidateCount, 0);

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-artifact',
    mode: 'artifact-dry-run',
    generatedAt: options.generatedAt || new Date().toISOString(),
    artifactPath: options.artifactPath || null,
    artifactGeneratedAt: artifact.generatedAt || null,
    artifactMode: artifact.mode || null,
    artifactEvidence: options.artifactEvidence || null,
    validation,
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
    profile: summarizeProfilePlan(options.profilePlan),
    domainCount: domainPlans.length,
    candidateCount,
    domains: domainPlans,
  };
}

/**
 * Build a non-throwing exact-host comparison for a valid artifact.
 *
 * @param {object} artifact Parsed graph-feedback artifact.
 * @param {object} [options]
 * @param {string} [options.artifactPath] Source path for operator context.
 * @param {string[]} [options.domains] Planned/requested hosts to compare.
 * @param {string} [options.generatedAt] Stable timestamp for deterministic tests.
 * @returns {object} File-only host comparison result.
 */
function buildArtifactHostComparisonFromPlan(artifact, options = {}) {
  const validation = validateGraphFeedbackArtifact(artifact, []);
  const requestedHosts = normalizeDomains(options.domains || []);
  const explicitHosts = normalizeDomains(options.explicitDomains || []);
  const artifactHostSet = new Set(validation.artifactHosts);
  const requestedHostSet = new Set(requestedHosts);
  const matchedHosts = requestedHosts.filter(host => artifactHostSet.has(host));
  const missingHosts = requestedHosts.filter(host => !artifactHostSet.has(host));
  const extraArtifactHosts = validation.artifactHosts.filter(host => !requestedHostSet.has(host));
  const profile = summarizeProfilePlan(options.profilePlan);
  const hasMissingPlannedHosts = profile && !profile.hasStaticHosts && !requestedHosts.length;

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-artifact',
    mode: 'artifact-host-comparison',
    generatedAt: options.generatedAt || new Date().toISOString(),
    artifactPath: options.artifactPath || null,
    artifactGeneratedAt: artifact.generatedAt || null,
    artifactMode: artifact.mode || null,
    artifactEvidence: options.artifactEvidence || null,
    ok: missingHosts.length === 0 && !hasMissingPlannedHosts,
    artifactHosts: validation.artifactHosts,
    requestedHosts,
    explicitRequestedHosts: explicitHosts,
    profileHosts: profile ? profile.hosts : [],
    plannedHosts: requestedHosts,
    matchedHosts,
    missingHosts,
    extraArtifactHosts,
    recommendationCounts: buildRecommendationCountsByHost(artifact),
    profile,
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
    hostCaveat: 'Host matching is exact. An artifact for www.bbc.com will not validate for a plan that requests bbc.com, and the reverse is also true.',
  };
}

/**
 * Build a compact file-only profile preflight report.
 *
 * @param {object} options
 * @param {string} [options.artifactPath] Optional saved artifact path.
 * @param {object} options.profilePlan File-only profile host plan.
 * @param {string[]} [options.domains] Planned hosts from the profile.
 * @param {string[]} [options.explicitDomains] Explicit CLI hosts, if supplied.
 * @param {string} [options.generatedAt] Stable timestamp for tests.
 * @param {object} [options.fs] Filesystem seam for artifact reads.
 * @returns {Promise<object>} Bounded preflight report.
 */
async function buildProfilePreflightReport(options = {}) {
  const profile = summarizeProfilePlan(options.profilePlan);
  if (!profile) {
    throw new Error('Profile preflight requires a profile plan');
  }

  const plannedHosts = normalizeDomains(options.domains || profile.hosts || []);
  const explicitHosts = normalizeDomains(options.explicitDomains || []);
  const caveats = [...(profile.caveats || [])];
  let artifact = null;
  let hostComparison = null;
  let artifactEvidence = null;
  let matchedCandidateCount = 0;

  if (options.artifactPath) {
    const { artifact: parsedArtifact, evidence } = await readGraphFeedbackArtifactFile(options.artifactPath, options);
    artifactEvidence = evidence;
    const comparison = buildArtifactHostComparisonFromPlan(parsedArtifact, {
      artifactPath: options.artifactPath,
      domains: plannedHosts,
      explicitDomains: explicitHosts,
      generatedAt: options.generatedAt,
      profilePlan: options.profilePlan,
      artifactEvidence,
    });

    artifact = {
      artifactPath: options.artifactPath,
      artifactGeneratedAt: parsedArtifact.generatedAt || null,
      artifactMode: parsedArtifact.mode || null,
      artifactHosts: comparison.artifactHosts,
      recommendationCount: Number(parsedArtifact.recommendationCount || 0),
      recommendationCounts: comparison.recommendationCounts,
      limits: parsedArtifact.limits && typeof parsedArtifact.limits === 'object' && !Array.isArray(parsedArtifact.limits)
        ? {
          perHostLimit: Number(parsedArtifact.limits.perHostLimit || 0),
          sampleLimit: Number(parsedArtifact.limits.sampleLimit || 0),
        }
        : null,
      evidence: artifactEvidence,
    };
    hostComparison = {
      ok: comparison.ok,
      matchedHosts: comparison.matchedHosts,
      missingHosts: comparison.missingHosts,
      extraArtifactHosts: comparison.extraArtifactHosts,
      hostCaveat: comparison.hostCaveat,
    };
    matchedCandidateCount = comparison.matchedHosts.reduce(
      (total, host) => total + Number(comparison.recommendationCounts[host] || 0),
      0
    );
    caveats.push(...artifactEvidence.warnings);
    if (!comparison.ok) {
      caveats.push('Artifact hosts do not exactly match the profile hosts; regenerate the artifact with the profile host spelling before strict previews.');
    }
  } else if (!plannedHosts.length) {
    caveats.push('No artifact supplied and no static profile hosts are available, so only profile caveats can be reported.');
  }

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-profile-preflight',
    mode: 'profile-preflight',
    generatedAt: options.generatedAt || new Date().toISOString(),
    ok: Boolean(profile.hasStaticHosts && (!hostComparison || hostComparison.ok)),
    profile,
    plannedHosts,
    explicitRequestedHosts: explicitHosts,
    artifact,
    hostComparison,
    candidateCount: matchedCandidateCount,
    readiness: buildProfileReadiness({
      profile,
      plannedHosts,
      artifactSupplied: Boolean(artifact),
      hostComparison,
      candidateCount: matchedCandidateCount,
      caveats,
    }),
    caveats: uniqueStrings(caveats),
    recommendedCommands: buildProfilePreflightCommands({
      artifactPath: options.artifactPath,
      profile,
      plannedHosts,
      profileDir: options.profileDir,
      hasArtifact: Boolean(options.artifactPath),
      hostMatchOk: !hostComparison || hostComparison.ok,
    }),
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
  };
}

/**
 * Build a compact file-only operator report across one or more crawl profiles.
 *
 * The report combines the same profile-summary and profile-preflight data used
 * by other graph-feedback artifact modes. It reads only profile JSON and an
 * optional saved artifact; it does not open a DB, import sibling repos, invoke
 * crawlers, enqueue URLs, seed remote crawlers, or change collect behavior.
 *
 * @param {object} options
 * @param {string[]} [options.profileNames] Explicit profile names or paths.
 * @param {boolean} [options.allCommonProfiles] Include the default common profile set.
 * @param {string} [options.profileDir] Directory containing named crawl profiles.
 * @param {string} [options.artifactPath] Optional saved graph-feedback artifact.
 * @param {string} [options.generatedAt] Stable timestamp for tests.
 * @returns {Promise<object>} Bounded operator report JSON.
 */
async function buildOperatorReport(options = {}) {
  const requestedProfileNames = options.allCommonProfiles
    ? DEFAULT_PROFILE_COMPATIBILITY_NAMES
    : (Array.isArray(options.profileNames) ? options.profileNames : []);
  if (!requestedProfileNames.length) {
    throw new Error('--operator-report requires --profile <name> or --all-common-profiles');
  }
  const reportCommands = options.reportCommands || 'full';
  let reportMaxProfiles = null;
  if (options.reportMaxProfiles !== undefined) {
    if (!Number.isInteger(options.reportMaxProfiles) || options.reportMaxProfiles <= 0) {
      throw new Error(`Expected --report-max-profiles to be a positive integer, got: ${options.reportMaxProfiles}`);
    }
    if (options.reportMaxProfiles > MAX_OPERATOR_REPORT_PROFILES) {
      throw new Error(`--report-max-profiles must be <= ${MAX_OPERATOR_REPORT_PROFILES}`);
    }
    reportMaxProfiles = options.reportMaxProfiles;
  }
  const profileNames = reportMaxProfiles ? requestedProfileNames.slice(0, reportMaxProfiles) : requestedProfileNames;
  const profileSelection = reportMaxProfiles ? {
    requestedCount: requestedProfileNames.length,
    reportedCount: profileNames.length,
    maxProfiles: reportMaxProfiles,
    truncated: profileNames.length < requestedProfileNames.length,
    omittedCount: Math.max(0, requestedProfileNames.length - profileNames.length),
  } : null;

  const summary = await buildProfileCompatibilitySummary(profileNames, {
    profileDir: options.profileDir,
    fs: options.profileFs,
    generatedAt: options.generatedAt,
  });

  let artifact = null;
  let parsedArtifact = null;
  let artifactEvidence = null;
  let recommendationCounts = {};
  if (options.artifactPath) {
    const artifactFile = await readGraphFeedbackArtifactFile(options.artifactPath, options);
    parsedArtifact = artifactFile.artifact;
    artifactEvidence = artifactFile.evidence;
    const validation = validateGraphFeedbackArtifact(parsedArtifact, []);
    recommendationCounts = buildRecommendationCountsByHost(parsedArtifact);
    artifact = {
      artifactPath: options.artifactPath,
      artifactGeneratedAt: parsedArtifact.generatedAt || null,
      artifactMode: parsedArtifact.mode || null,
      artifactHosts: validation.artifactHosts,
      recommendationCount: Number(parsedArtifact.recommendationCount || 0),
      recommendationCounts,
      limits: validation.limits,
      evidence: artifactEvidence,
    };
  }

  const profiles = summary.profiles.map(profilePlan => buildOperatorProfileReport(profilePlan, {
    artifactPath: options.artifactPath,
    parsedArtifact,
    artifactEvidence,
    recommendationCounts,
    generatedAt: options.generatedAt,
    profileDir: options.profileDir,
    reportCommands,
  }));

  const report = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-operator-report',
    mode: 'operator-report',
    generatedAt: options.generatedAt || new Date().toISOString(),
    profileDir: path.resolve(options.profileDir || DEFAULT_PROFILE_DIR),
    profileCount: profiles.length,
    artifact,
    readinessSummary: buildOperatorReadinessSummary(profiles, {
      requestedProfileCount: requestedProfileNames.length,
      profileSelection,
      artifactSupplied: Boolean(parsedArtifact),
    }),
    profiles,
    caveats: [
      'Host matching is exact. Generate graph-feedback artifacts with the exact host spelling a profile plans.',
      'Hostless profiles report caveats instead of guessed hosts.',
      'Orchestrator and e2e profiles can expose static hosts, but live runtime may choose additional phases or a remote/local path later.',
      ...(artifactEvidence ? artifactEvidence.warnings : []),
    ],
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
  };
  if (profileSelection) report.profileSelection = profileSelection;
  if (reportCommands !== 'full') report.reportCommands = reportCommands;
  return report;
}

function buildOperatorReadinessSummary(profiles, options = {}) {
  const countsByLabel = {
    'ready-for-preview': 0,
    'needs-artifact': 0,
    'host-mismatch': 0,
    'hostless-caveat': 0,
  };
  let staticHostsPresentCount = 0;
  let artifactSuppliedCount = 0;
  let artifactMissingCount = 0;
  let exactHostMatchCount = 0;
  let matchedCandidateCount = 0;
  let caveatCount = 0;

  for (const item of profiles || []) {
    const readiness = item && item.readiness ? item.readiness : {};
    const label = readiness.label || 'unknown';
    countsByLabel[label] = Number(countsByLabel[label] || 0) + 1;
    if (readiness.staticHostsPresent) staticHostsPresentCount += 1;
    if (readiness.artifactSupplied) artifactSuppliedCount += 1;
    else artifactMissingCount += 1;
    if (readiness.exactHostMatch) exactHostMatchCount += 1;
    matchedCandidateCount += Number(readiness.candidateCount || 0);
    caveatCount += Number(readiness.caveatCount || 0);
  }

  return {
    requestedProfileCount: Number(options.requestedProfileCount || profiles.length || 0),
    reportedProfileCount: profiles.length,
    omittedProfileCount: options.profileSelection ? Number(options.profileSelection.omittedCount || 0) : 0,
    artifactSupplied: Boolean(options.artifactSupplied),
    artifactSuppliedCount,
    artifactMissingCount,
    staticHostsPresentCount,
    hostlessProfileCount: profiles.length - staticHostsPresentCount,
    exactHostMatchCount,
    countsByLabel,
    matchedCandidateCount,
    caveatCount,
  };
}

function buildOperatorProfileReport(profilePlan, options = {}) {
  const profile = summarizeProfilePlan(profilePlan);
  const plannedHosts = normalizeDomains(profile.hosts || []);
  const suggestedArtifactPath = `tmp/graph-feedback-${slugifyProfileName(
    profile.profileIdentifier || profile.profileName || profile.profilePath
  )}.json`;
  const caveats = [...(profile.caveats || [])];
  let hostComparison = null;
  let candidateCount = 0;

  if (options.parsedArtifact) {
    const comparison = buildArtifactHostComparisonFromPlan(options.parsedArtifact, {
      artifactPath: options.artifactPath,
      domains: plannedHosts,
      generatedAt: options.generatedAt,
      profilePlan,
      artifactEvidence: options.artifactEvidence,
    });
    hostComparison = {
      ok: comparison.ok,
      matchedHosts: comparison.matchedHosts,
      missingHosts: comparison.missingHosts,
      extraArtifactHosts: comparison.extraArtifactHosts,
      hostCaveat: comparison.hostCaveat,
    };
    candidateCount = comparison.matchedHosts.reduce(
      (total, host) => total + Number(options.recommendationCounts[host] || 0),
      0
    );
    if (!comparison.ok) {
      caveats.push('Artifact hosts do not exactly match this profile; regenerate the artifact with the profile host spelling before strict previews.');
    }
    if (options.artifactEvidence) {
      caveats.push(...options.artifactEvidence.warnings);
    }
  } else if (!plannedHosts.length) {
    caveats.push('No artifact supplied and no static profile hosts are available, so only profile caveats can be reported.');
  }

  const readiness = buildProfileReadiness({
    profile,
    plannedHosts,
    artifactSupplied: Boolean(options.parsedArtifact),
    hostComparison,
    candidateCount,
    caveats,
  });
  const recommendedCommands = compactOperatorReportCommands(buildProfilePreflightCommands({
    artifactPath: options.artifactPath || suggestedArtifactPath,
    profile,
    plannedHosts,
    profileDir: options.profileDir,
    hasArtifact: Boolean(options.parsedArtifact),
    hostMatchOk: !hostComparison || hostComparison.ok,
  }), readiness.label, options.reportCommands || 'full');

  return {
    profile,
    plannedHosts,
    suggestedArtifactPath,
    artifactPath: options.artifactPath || null,
    hostComparison,
    candidateCount,
    readiness,
    caveats: uniqueStrings(caveats),
    recommendedCommands,
  };
}

function renderOperatorReportMarkdown(report) {
  const lines = [
    '# Graph Feedback Operator Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Profile directory: ${report.profileDir}`,
    '',
    'Action policy: no URLs are enqueued, no remote crawlers are seeded, and collect behavior is unchanged.',
  ];
  if (report.profileSelection) {
    lines.push(`Profile selection: ${report.profileSelection.reportedCount}/${report.profileSelection.requestedCount} shown${report.profileSelection.truncated ? `, ${report.profileSelection.omittedCount} omitted` : ''}.`);
  }
  if (report.reportCommands) {
    lines.push(`Command detail: ${report.reportCommands}.`);
  }
  lines.push(
    '',
    'Readiness labels: ready-for-preview, needs-artifact, host-mismatch, hostless-caveat.',
    ''
  );

  if (report.artifact) {
    lines.push('## Artifact');
    lines.push('');
    lines.push(`- Path: \`${report.artifact.artifactPath}\``);
    lines.push(`- Hosts: ${formatInlineList(report.artifact.artifactHosts)}`);
    lines.push(`- Candidates: ${report.artifact.recommendationCount}`);
    if (report.artifact.evidence) {
      lines.push(`- Size: ${report.artifact.evidence.byteSize} bytes`);
      lines.push(`- generatedAt valid: ${report.artifact.evidence.generatedAtValid ? 'yes' : 'no'}`);
      if (Number.isFinite(report.artifact.evidence.ageSeconds)) {
        lines.push(`- Age: ${formatDurationSeconds(report.artifact.evidence.ageSeconds)}`);
      }
      if (report.artifact.evidence.warnings.length) {
        lines.push('- Artifact warnings:');
        for (const warning of report.artifact.evidence.warnings) {
          lines.push(`  - ${warning}`);
        }
      }
    }
    lines.push('');
  }

  if (report.readinessSummary) {
    lines.push('## Readiness Summary');
    lines.push('');
    lines.push(`- Profiles shown: ${report.readinessSummary.reportedProfileCount}/${report.readinessSummary.requestedProfileCount}`);
    if (report.readinessSummary.omittedProfileCount) {
      lines.push(`- Profiles omitted: ${report.readinessSummary.omittedProfileCount}`);
    }
    lines.push(`- Static-host profiles: ${report.readinessSummary.staticHostsPresentCount}`);
    lines.push(`- Hostless profiles: ${report.readinessSummary.hostlessProfileCount}`);
    lines.push(`- Exact host matches: ${report.readinessSummary.exactHostMatchCount}`);
    lines.push(`- Matched candidate count: ${report.readinessSummary.matchedCandidateCount}`);
    lines.push('- Labels:');
    for (const label of Object.keys(report.readinessSummary.countsByLabel || {})) {
      lines.push(`  - ${label}: ${report.readinessSummary.countsByLabel[label]}`);
    }
    lines.push('');
  }

  lines.push('## Profiles');
  lines.push('');
  for (const item of report.profiles || []) {
    const profile = item.profile || {};
    lines.push(`### ${profile.profileName || profile.profileIdentifier || 'profile'}`);
    lines.push('');
    lines.push(`- Tool: \`${profile.tool || 'unknown'}\``);
    lines.push(`- Planned hosts: ${formatInlineList(item.plannedHosts)}`);
    lines.push(`- Suggested artifact: \`${item.suggestedArtifactPath}\``);
    if (item.readiness) {
      lines.push(`- Readiness: ${item.readiness.label}`);
    }
    if (item.hostComparison) {
      lines.push(`- Host match: ${item.hostComparison.ok ? 'ok' : 'mismatch'}`);
      lines.push(`- Matched hosts: ${formatInlineList(item.hostComparison.matchedHosts)}`);
      lines.push(`- Missing hosts: ${formatInlineList(item.hostComparison.missingHosts)}`);
      lines.push(`- Extra artifact hosts: ${formatInlineList(item.hostComparison.extraArtifactHosts)}`);
    }
    lines.push(`- Candidate count for matched hosts: ${Number(item.candidateCount || 0)}`);
    if (item.caveats && item.caveats.length) {
      lines.push('- Caveats:');
      for (const caveat of item.caveats) {
        lines.push(`  - ${caveat}`);
      }
    }
    if (item.recommendedCommands && item.recommendedCommands.length) {
      lines.push('- Safe commands:');
      for (const command of item.recommendedCommands.slice(0, 5)) {
        lines.push(`  - ${command.step}: \`${command.command}\``);
      }
    } else {
      lines.push('- Safe commands: (omitted by report command settings)');
    }
    lines.push('');
  }

  lines.push('## Global Caveats');
  lines.push('');
  for (const caveat of report.caveats || []) {
    lines.push(`- ${caveat}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function renderProfilePreflightText(preflight) {
  const readiness = preflight && preflight.readiness ? preflight.readiness : {};
  const hostComparison = preflight && preflight.hostComparison ? preflight.hostComparison : null;
  const artifactEvidence = preflight && preflight.artifact && preflight.artifact.evidence
    ? preflight.artifact.evidence
    : null;
  const nextCommand = selectNextCommandForReadiness(
    preflight && Array.isArray(preflight.recommendedCommands) ? preflight.recommendedCommands : [],
    readiness.label
  );
  const artifactWarnings = artifactEvidence && Array.isArray(artifactEvidence.warnings)
    ? artifactEvidence.warnings
    : [];
  const lines = [
    'Graph feedback profile preflight (read-only)',
    `Profile: ${(preflight.profile && (preflight.profile.profileName || preflight.profile.profileIdentifier)) || '(unknown)'}`,
    `Readiness: ${readiness.label || 'unknown'}`,
    `Planned hosts: ${formatPlainList(preflight.plannedHosts)}`,
    `Candidate count for matched hosts: ${Number(preflight.candidateCount || 0)}`,
  ];

  if (preflight.artifact) {
    lines.push(`Artifact: ${preflight.artifact.artifactPath}`);
    if (artifactEvidence) {
      lines.push(`Artifact size: ${artifactEvidence.byteSize} bytes`);
      lines.push(`Artifact generatedAt valid: ${artifactEvidence.generatedAtValid ? 'yes' : 'no'}`);
      if (Number.isFinite(artifactEvidence.ageSeconds)) {
        lines.push(`Artifact age: ${formatDurationSeconds(artifactEvidence.ageSeconds)}`);
      }
    }
  } else {
    lines.push('Artifact: (none)');
  }

  if (hostComparison) {
    lines.push(`Host match: ${hostComparison.ok ? 'ok' : 'mismatch'}`);
    lines.push(`Matched hosts: ${formatPlainList(hostComparison.matchedHosts)}`);
    lines.push(`Missing hosts: ${formatPlainList(hostComparison.missingHosts)}`);
    lines.push(`Extra artifact hosts: ${formatPlainList(hostComparison.extraArtifactHosts)}`);
  } else {
    lines.push('Host match: not checked');
  }

  if (artifactWarnings.length) {
    lines.push('Artifact warnings:');
    for (const warning of artifactWarnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (preflight.caveats && preflight.caveats.length) {
    lines.push('Caveats:');
    for (const caveat of preflight.caveats) {
      lines.push(`- ${caveat}`);
    }
  }

  if (nextCommand) {
    lines.push(`Next safest command: ${nextCommand.command}`);
  } else {
    lines.push('Next safest command: (none)');
  }
  lines.push('Actions: no URLs enqueued; no remote crawlers seeded; collect behavior unchanged.');
  return `${lines.join('\n')}\n`;
}

function renderProfileWorkflowChecklistMarkdown(workflow) {
  const profile = workflow && workflow.profile ? workflow.profile : {};
  const readiness = workflow && workflow.readiness ? workflow.readiness : {};
  const artifact = workflow && workflow.artifact ? workflow.artifact : null;
  const hostComparison = workflow && workflow.hostComparison ? workflow.hostComparison : null;
  const lines = [
    '# Graph Feedback Profile Workflow Checklist',
    '',
    `Profile: \`${profile.profileName || profile.profileIdentifier || 'profile'}\``,
    `Readiness: ${readiness.label || 'unknown'}`,
    `Planned hosts: ${formatInlineList(workflow.plannedHosts)}`,
    `Candidate count for matched hosts: ${Number(workflow.candidateCount || 0)}`,
    `Artifact path: \`${workflow.artifactPath || '(none)'}\``,
    '',
    'Action policy: no URLs are enqueued, no remote crawlers are seeded, and collect behavior is unchanged.',
    '',
  ];

  if (artifact) {
    lines.push('## Artifact Evidence');
    lines.push('');
    lines.push(`- Hosts: ${formatInlineList(artifact.artifactHosts)}`);
    lines.push(`- Candidate count: ${Number(artifact.recommendationCount || 0)}`);
    if (artifact.evidence) {
      lines.push(`- Size: ${artifact.evidence.byteSize} bytes`);
      lines.push(`- generatedAt valid: ${artifact.evidence.generatedAtValid ? 'yes' : 'no'}`);
      if (Number.isFinite(artifact.evidence.ageSeconds)) {
        lines.push(`- Age: ${formatDurationSeconds(artifact.evidence.ageSeconds)}`);
      }
      if (artifact.evidence.warnings.length) {
        lines.push('- Warnings:');
        for (const warning of artifact.evidence.warnings) {
          lines.push(`  - ${warning}`);
        }
      }
    }
    lines.push('');
  } else {
    lines.push('Artifact evidence: no artifact supplied; generate the bounded artifact before strict validation or dry-run preview.');
    lines.push('');
  }

  if (hostComparison) {
    lines.push('## Host Match');
    lines.push('');
    lines.push(`- Status: ${hostComparison.ok ? 'ok' : 'mismatch'}`);
    lines.push(`- Matched hosts: ${formatInlineList(hostComparison.matchedHosts)}`);
    lines.push(`- Missing hosts: ${formatInlineList(hostComparison.missingHosts)}`);
    lines.push(`- Extra artifact hosts: ${formatInlineList(hostComparison.extraArtifactHosts)}`);
    lines.push(`- Caveat: ${hostComparison.hostCaveat}`);
    lines.push('');
  }

  lines.push('## Checklist');
  lines.push('');
  for (const [index, item] of (workflow.checklist || []).entries()) {
    lines.push(`${index + 1}. ${item.label || item.step}`);
    lines.push(`   Command: \`${item.command}\``);
    if (item.note) lines.push(`   Note: ${item.note}`);
  }
  lines.push('');

  if (workflow.caveats && workflow.caveats.length) {
    lines.push('## Caveats');
    lines.push('');
    for (const caveat of workflow.caveats) {
      lines.push(`- ${caveat}`);
    }
    lines.push('');
  }

  lines.push('## References');
  lines.push('');
  for (const reference of workflow.references || []) {
    lines.push(`- ${reference}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function compactOperatorReportCommands(commands, readinessLabel, commandMode = 'full') {
  if (commandMode === 'full') return commands;
  if (commandMode === 'none') return [];
  if (commandMode !== 'minimal') {
    throw new Error(`Expected report commands full, minimal, or none, got: ${commandMode}`);
  }

  const preferred = selectNextCommandForReadiness(commands, readinessLabel);
  return preferred ? [preferred] : [];
}

function selectNextCommandForReadiness(commands, readinessLabel) {
  const preferredStepByReadiness = {
    'ready-for-preview': 'preview-profile-planning',
    'needs-artifact': 'generate-bounded-artifact',
    'host-mismatch': 'compare-profile-hosts',
    'hostless-caveat': 'profile-summary',
  };
  const preferredStep = preferredStepByReadiness[readinessLabel] || 'profile-summary';
  const preferred = commands.find(command => command.step === preferredStep);
  if (preferred) return preferred;
  return commands.length ? commands[0] : null;
}

function formatInlineList(values) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) return '(none)';
  return list.map(value => `\`${value}\``).join(', ');
}

function formatPlainList(values) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  return list.length ? list.join(', ') : '(none)';
}

function buildArtifactEvidence(artifact, options = {}) {
  const generatedAt = artifact && Object.prototype.hasOwnProperty.call(artifact, 'generatedAt')
    ? artifact.generatedAt
    : null;
  const parsedGeneratedAt = parseIsoTimestamp(generatedAt);
  const referenceAt = options.referenceAt || new Date().toISOString();
  const parsedReferenceAt = parseIsoTimestamp(referenceAt);
  const warnings = [];
  let ageSeconds = null;

  if (!generatedAt) {
    warnings.push('Artifact generatedAt is missing; freshness cannot be assessed.');
  } else if (!parsedGeneratedAt.valid) {
    warnings.push('Artifact generatedAt is invalid; freshness cannot be assessed.');
  } else if (parsedReferenceAt.valid) {
    ageSeconds = Math.round((parsedReferenceAt.epochMs - parsedGeneratedAt.epochMs) / 1000);
    if (ageSeconds < 0) {
      warnings.push('Artifact generatedAt is in the future relative to the report time; check system clocks.');
    } else if (ageSeconds * 1000 > STALE_ARTIFACT_WARNING_MS) {
      warnings.push(`Artifact is older than ${STALE_ARTIFACT_WARNING_DAYS} days; regenerate before strict operational use.`);
    }
  }

  return {
    byteSize: Number(options.byteSize || 0),
    maxBytes: MAX_ARTIFACT_BYTES,
    sizeOk: Number(options.byteSize || 0) <= MAX_ARTIFACT_BYTES,
    generatedAt: generatedAt || null,
    generatedAtValid: parsedGeneratedAt.valid,
    generatedAtEpochMs: parsedGeneratedAt.valid ? parsedGeneratedAt.epochMs : null,
    referenceAt: parsedReferenceAt.valid ? new Date(parsedReferenceAt.epochMs).toISOString() : String(referenceAt || ''),
    ageSeconds,
    staleWarningDays: STALE_ARTIFACT_WARNING_DAYS,
    warnings: uniqueStrings(warnings),
  };
}

function parseIsoTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return { valid: false, epochMs: null };
  const epochMs = Date.parse(text);
  if (!Number.isFinite(epochMs)) return { valid: false, epochMs: null };
  return { valid: true, epochMs };
}

function buildProfileReadiness(options = {}) {
  const profile = options.profile || {};
  const plannedHosts = normalizeDomains(options.plannedHosts || profile.hosts || []);
  const hasStaticHosts = Boolean(profile.hasStaticHosts && plannedHosts.length);
  const artifactSupplied = Boolean(options.artifactSupplied);
  const hostComparison = options.hostComparison || null;
  const exactHostMatch = Boolean(artifactSupplied && hostComparison && hostComparison.ok);
  const candidateCount = Number(options.candidateCount || 0);
  const caveatCount = uniqueStrings(options.caveats || []).length;
  let label = 'ready-for-preview';

  if (!hasStaticHosts) {
    label = 'hostless-caveat';
  } else if (!artifactSupplied) {
    label = 'needs-artifact';
  } else if (!exactHostMatch) {
    label = 'host-mismatch';
  }

  return {
    label,
    staticHostsPresent: hasStaticHosts,
    artifactSupplied,
    exactHostMatch,
    candidateCount,
    caveatCount,
  };
}

function formatDurationSeconds(seconds) {
  const value = Math.abs(Number(seconds || 0));
  if (value < 60) return `${Math.round(seconds)}s`;
  if (value < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (value < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function buildRecommendationCountsByHost(artifact) {
  const counts = {};
  for (const domain of artifact.domains || []) {
    const host = normalizeHost(domain && domain.host);
    if (!host) continue;
    counts[host] = Array.isArray(domain.recommendations) ? domain.recommendations.length : 0;
  }
  return counts;
}

/**
 * Validate the saved artifact contract before any planning consumer trusts it.
 *
 * @param {object} artifact Parsed graph-feedback artifact.
 * @param {string[]|string} requestedDomains Optional host filter from CLI args.
 * @returns {object} Validation summary used in the dry-run output.
 */
function validateGraphFeedbackArtifact(artifact, requestedDomains = []) {
  const errors = [];

  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new Error('Invalid graph-feedback artifact: expected a JSON object');
  }

  if (artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ARTIFACT_SCHEMA_VERSION}`);
  }

  const domains = Array.isArray(artifact.domains) ? artifact.domains : null;
  if (!domains) {
    errors.push('domains must be an array');
  }

  const limitValidation = validateArtifactLimits(artifact.limits);
  errors.push(...limitValidation.errors);

  const artifactHosts = [];
  const seenHosts = new Set();
  let totalRecommendationCount = 0;

  if (domains) {
    for (const [index, domain] of domains.entries()) {
      if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
        errors.push(`domains[${index}] must be an object`);
        continue;
      }

      const host = normalizeHost(domain.host);
      if (!host) {
        errors.push(`domains[${index}].host must be a non-empty host`);
        continue;
      }

      if (seenHosts.has(host)) {
        errors.push(`domains contains duplicate host ${host}`);
        continue;
      }

      seenHosts.add(host);
      artifactHosts.push(host);
      totalRecommendationCount += validateArtifactDomainBounds(domain, host, limitValidation.limits, errors);
    }
  }

  if (Number.isFinite(Number(artifact.domainCount)) && Number(artifact.domainCount) !== artifactHosts.length) {
    errors.push(`domainCount ${artifact.domainCount} does not match domains length ${artifactHosts.length}`);
  }

  const declaredRecommendationCount = Number(artifact.recommendationCount);
  if (!Number.isInteger(declaredRecommendationCount) || declaredRecommendationCount < 0) {
    errors.push('recommendationCount must be a non-negative integer');
  } else if (declaredRecommendationCount !== totalRecommendationCount) {
    errors.push(`recommendationCount ${artifact.recommendationCount} does not match recommendations length ${totalRecommendationCount}`);
  }

  const requestedHosts = normalizeDomains(requestedDomains);
  const missingHosts = requestedHosts.filter(host => !seenHosts.has(host));
  if (missingHosts.length) {
    errors.push(`requested host(s) not present in artifact: ${missingHosts.join(', ')}`);
  }

  if (errors.length) {
    throw new Error(`Invalid graph-feedback artifact: ${errors.join('; ')}`);
  }

  return {
    ok: true,
    schemaVersion: artifact.schemaVersion,
    artifactHosts,
    requestedHosts,
    selectedHosts: requestedHosts.length ? requestedHosts : artifactHosts,
    limits: limitValidation.limits,
  };
}

function validateArtifactLimits(limits) {
  const errors = [];

  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    return {
      errors: ['limits must be an object'],
      limits: {
        perHostLimit: 0,
        sampleLimit: 0,
        maxPerHostLimit: MAX_PER_HOST_LIMIT,
        maxSampleLimit: MAX_SAMPLE_LIMIT,
      },
    };
  }

  const perHostLimit = positiveInteger(limits.perHostLimit, 'limits.perHostLimit', errors);
  const sampleLimit = positiveInteger(limits.sampleLimit, 'limits.sampleLimit', errors);
  const maxPerHostLimit = positiveInteger(limits.maxPerHostLimit, 'limits.maxPerHostLimit', errors);
  const maxSampleLimit = positiveInteger(limits.maxSampleLimit, 'limits.maxSampleLimit', errors);

  if (perHostLimit && maxPerHostLimit && perHostLimit > maxPerHostLimit) {
    errors.push('limits.perHostLimit must be <= limits.maxPerHostLimit');
  }
  if (sampleLimit && maxSampleLimit && sampleLimit > maxSampleLimit) {
    errors.push('limits.sampleLimit must be <= limits.maxSampleLimit');
  }
  if (maxPerHostLimit && maxPerHostLimit > MAX_PER_HOST_LIMIT) {
    errors.push(`limits.maxPerHostLimit must be <= ${MAX_PER_HOST_LIMIT}`);
  }
  if (maxSampleLimit && maxSampleLimit > MAX_SAMPLE_LIMIT) {
    errors.push(`limits.maxSampleLimit must be <= ${MAX_SAMPLE_LIMIT}`);
  }

  return {
    errors,
    limits: {
      perHostLimit: perHostLimit || 0,
      sampleLimit: sampleLimit || 0,
      maxPerHostLimit: maxPerHostLimit || MAX_PER_HOST_LIMIT,
      maxSampleLimit: maxSampleLimit || MAX_SAMPLE_LIMIT,
    },
  };
}

function validateArtifactDomainBounds(domain, host, limits, errors) {
  if (!Array.isArray(domain.recommendations)) {
    errors.push(`${host}.recommendations must be an array`);
    return 0;
  } else {
    if (limits.perHostLimit && domain.recommendations.length > limits.perHostLimit) {
      errors.push(`${host}.recommendations length ${domain.recommendations.length} exceeds limits.perHostLimit ${limits.perHostLimit}`);
    }
    domain.recommendations.forEach((recommendation, index) => {
      if (!recommendation || typeof recommendation !== 'object' || Array.isArray(recommendation)) {
        errors.push(`${host}.recommendations[${index}] must be an object`);
      } else {
        const url = String(recommendation.url || '').trim();
        if (!url) {
          errors.push(`${host}.recommendations[${index}].url must be non-empty`);
        } else if (url.length > MAX_ARTIFACT_URL_LENGTH) {
          errors.push(`${host}.recommendations[${index}].url length ${url.length} exceeds ${MAX_ARTIFACT_URL_LENGTH}`);
        }
      }
    });
  }

  const diagnostics = domain.diagnostics || {};
  validateSampleArray(diagnostics.orphanSamples, `${host}.diagnostics.orphanSamples`, limits.sampleLimit, errors);
  validateSampleArray(diagnostics.deadEndSamples, `${host}.diagnostics.deadEndSamples`, limits.sampleLimit, errors);
  return domain.recommendations.length;
}

function validateSampleArray(samples, field, sampleLimit, errors) {
  if (samples === undefined || samples === null) return;
  if (!Array.isArray(samples)) {
    errors.push(`${field} must be an array`);
    return;
  }
  if (sampleLimit && samples.length > sampleLimit) {
    errors.push(`${field} length ${samples.length} exceeds limits.sampleLimit ${sampleLimit}`);
  }
}

function positiveInteger(value, field, errors) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return parsed;
}

function buildArtifactDomainConsideration(domain, perHostLimit) {
  const candidates = buildCandidateConsiderations(domain, perHostLimit);
  const recommendations = Array.isArray(domain.recommendations) ? domain.recommendations : [];

  return {
    host: normalizeHost(domain.host),
    status: domain.status || null,
    sourceMode: domain.mode || null,
    posture: Array.isArray(domain.posture) ? domain.posture.slice() : [],
    recommendationCount: recommendations.length,
    candidateCount: candidates.length,
    candidates,
  };
}

function buildCandidateConsiderations(domain, perHostLimit) {
  return (domain.recommendations || []).slice(0, perHostLimit).map((recommendation, index) => ({
    rank: index + 1,
    url: recommendation.url,
    urlId: recommendation.urlId ?? null,
    priorityScore: finiteNumber(recommendation.priorityScore, 0),
    reason: recommendation.reason || 'graph feedback recommendation',
    sources: uniqueStrings(recommendation.sources),
    signals: uniqueStrings(recommendation.signals),
    metadata: recommendation.metadata && typeof recommendation.metadata === 'object' && !Array.isArray(recommendation.metadata)
      ? recommendation.metadata
      : {},
    consideration: 'would-consider-as-seed-candidate',
    wouldEnqueue: false,
    wouldSeedRemote: false,
    wouldChangeCollect: false,
  }));
}

/**
 * Build a JSON recipe for the safe graph-feedback artifact workflow.
 *
 * The recipe is derived from an already-validated artifact dry-run. It is
 * file-only and does not open the DB, import sibling repos, seed remote
 * crawlers, enqueue URLs, or change collect behavior.
 *
 * @param {object} artifactPlan Output from buildArtifactPlanningDryRunFromPlan().
 * @param {object} [options]
 * @param {string} [options.artifactPath] Artifact path to show in commands.
 * @returns {object} Bounded operator command recipe.
 */
function buildArtifactWorkflowRecipe(artifactPlan, options = {}) {
  if (!artifactPlan || typeof artifactPlan !== 'object' || artifactPlan.mode !== 'artifact-dry-run') {
    throw new Error('Expected artifact dry-run plan before building graph-feedback recipe');
  }

  const validation = artifactPlan.validation || {};
  const hosts = Array.isArray(validation.selectedHosts) && validation.selectedHosts.length
    ? validation.selectedHosts
    : (Array.isArray(validation.artifactHosts) ? validation.artifactHosts : []);
  if (!hosts.length) {
    throw new Error('Cannot build graph-feedback recipe without artifact hosts');
  }

  const artifactPath = String(options.artifactPath || artifactPlan.artifactPath || '').trim() || '<artifact-path>';
  const profilePlan = options.profilePlan || artifactPlan.profile || null;
  const profileSummary = summarizeProfilePlan(profilePlan);
  const profileIdentifier = profileSummary
    ? (profileSummary.profileIdentifier || profileSummary.profileName || profileSummary.profilePath || '<profile-name>')
    : null;
  const hostsCsv = hosts.join(',');
  const limits = validation.limits || {};
  const generateArgs = [
    'node',
    'tools/crawl/graph-feedback.js',
    '--domains',
    hostsCsv,
  ];
  if (limits.perHostLimit) generateArgs.push('--limit', String(limits.perHostLimit));
  if (limits.sampleLimit) generateArgs.push('--sample-limit', String(limits.sampleLimit));
  generateArgs.push('--out', artifactPath, '--json');

  const validateArgs = [
    'node',
    'tools/crawl/graph-feedback.js',
    '--from-artifact',
    artifactPath,
  ];
  if (profileIdentifier) {
    validateArgs.push('--profile', profileIdentifier);
    pushProfileDirArg(validateArgs, options.profileDir);
  } else {
    validateArgs.push('--domains', hostsCsv);
  }
  validateArgs.push('--json');
  const compareArgs = [
    'node',
    'tools/crawl/graph-feedback.js',
    '--from-artifact',
    artifactPath,
  ];
  if (profileIdentifier) {
    compareArgs.push('--profile', profileIdentifier);
    pushProfileDirArg(compareArgs, options.profileDir);
  } else {
    compareArgs.push('--domains', hostsCsv);
  }
  compareArgs.push('--compare-hosts', '--json');
  const localPreviewArgs = [
    'node',
    'tools/crawl/run.js',
    '--explain',
    '--json',
    '--graph-feedback-artifact',
    artifactPath,
    hostsCsv,
  ];
  const remotePreviewArgs = profileIdentifier
    ? buildProfileDryRunArgs(profileIdentifier, artifactPath, options.profileDir)
    : [
      'node',
      'tools/crawl/index.js',
      'remote',
      'bounded',
      '--domains',
      hostsCsv,
      '--dry-run',
      '--graph-feedback-artifact',
      artifactPath,
    ];

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-artifact-recipe',
    mode: 'operator-recipe',
    artifactPath,
    artifactGeneratedAt: artifactPlan.artifactGeneratedAt || null,
    artifactMode: artifactPlan.artifactMode || null,
    hosts,
    profile: profileSummary,
    candidateCount: Number(artifactPlan.candidateCount || 0),
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
    hostCaveat: 'Host matching is exact. An artifact for www.bbc.com will not validate for a plan that requests bbc.com, and the reverse is also true.',
    commands: [
      {
        step: 'generate-bounded-artifact',
        command: renderShellCommand(generateArgs),
        note: 'Run this when creating or refreshing the artifact. It opens the DB read-only through sibling repo APIs and writes only the requested artifact.',
      },
      {
        step: profileSummary ? 'compare-profile-hosts' : 'compare-hosts',
        command: renderShellCommand(compareArgs),
        note: 'File-only exact host comparison; useful before profile previews where bbc.com and www.bbc.com must match exactly.',
      },
      {
        step: 'validate-artifact',
        command: renderShellCommand(validateArgs),
        note: 'File-only validation and candidate preview; no DB open and no sibling repo import.',
      },
      {
        step: 'preview-local-planning',
        command: renderShellCommand(localPreviewArgs),
        note: 'Read-only run.js explain output; no crawl jobs started.',
      },
      {
        step: profileSummary ? 'preview-profile-planning' : 'preview-remote-planning',
        command: renderShellCommand(remotePreviewArgs),
        note: 'Read-only unified-launcher remote dry-run; no remote crawler is started or seeded.',
      },
    ],
  };
}

function buildProfilePreflightCommands(options = {}) {
  const profile = options.profile || {};
  const profileIdentifier = profile.profileIdentifier || profile.profileName || profile.profilePath || '<profile-name>';
  const plannedHosts = normalizeDomains(options.plannedHosts || []);
  const hostsCsv = plannedHosts.join(',');
  const suggestedArtifactPath = options.artifactPath || `tmp/graph-feedback-${slugifyProfileName(profileIdentifier)}.json`;
  const commands = [{
    step: 'profile-summary',
    command: renderShellCommand([
      'node',
      'tools/crawl/graph-feedback.js',
      '--profile-summary',
      '--profile',
      profileIdentifier,
      '--pretty',
    ]),
    note: 'File-only profile host summary; no artifact or DB access.',
  }];

  if (plannedHosts.length) {
    commands.push({
      step: 'generate-bounded-artifact',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--domains',
        hostsCsv,
        '--limit',
        '25',
        '--sample-limit',
        '5',
        '--out',
        suggestedArtifactPath,
        '--json',
      ]),
      note: 'Read-only live graph-feedback generation through sibling repo APIs; writes only the requested bounded artifact.',
    });
  }

  if (options.hasArtifact) {
    commands.push({
      step: 'compare-profile-hosts',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--from-artifact',
        suggestedArtifactPath,
        '--profile',
        profileIdentifier,
        '--compare-hosts',
        '--pretty',
      ]),
      note: 'File-only artifact/profile host comparison.',
    });

    if (plannedHosts.length && options.hostMatchOk) {
      commands.push({
        step: 'validate-artifact',
        command: renderShellCommand([
          'node',
          'tools/crawl/graph-feedback.js',
          '--from-artifact',
          suggestedArtifactPath,
          '--profile',
          profileIdentifier,
          '--json',
        ]),
        note: 'File-only strict artifact validation and bounded candidate counts.',
      });
      commands.push({
        step: 'preview-profile-planning',
        command: renderShellCommand(buildProfileDryRunArgs(profileIdentifier, suggestedArtifactPath, options.profileDir)),
        note: 'Unified launcher profile dry-run; no crawler is started or seeded.',
      });
    }
  }

  return commands;
}

function buildProfileWorkflowChecklistCommands(options = {}) {
  const profile = options.profile || {};
  const profileIdentifier = profile.profileIdentifier || profile.profileName || profile.profilePath || '<profile-name>';
  const plannedHosts = normalizeDomains(options.plannedHosts || []);
  const hostsCsv = plannedHosts.join(',');
  const artifactPath = options.artifactPath || `tmp/graph-feedback-${slugifyProfileName(profileIdentifier)}.json`;
  const commands = [{
    step: 'profile-host-summary',
    label: 'Inspect exact profile hosts',
    command: renderShellCommand([
      'node',
      'tools/crawl/graph-feedback.js',
      '--profile-summary',
      '--profile',
      profileIdentifier,
      '--pretty',
    ]),
    note: 'File-only profile host summary; use this to confirm exact bbc.com vs www.bbc.com spelling.',
  }];

  if (!plannedHosts.length) {
    commands.push({
      step: 'profile-preflight-text',
      label: 'Print hostless profile caveats',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--profile-preflight',
        '--profile',
        profileIdentifier,
        '--preflight-format',
        'text',
      ]),
      note: 'File-only preflight; hostless profiles report caveats instead of guessed hosts.',
    });
    commands.push({
      step: 'compact-operator-report',
      label: 'Write a compact operator report',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--operator-report',
        '--profile',
        profileIdentifier,
        '--report-commands',
        'minimal',
        '--format',
        'markdown',
      ]),
      note: 'File-only report; no artifact, DB, crawler, seed, enqueue, or collect behavior.',
    });
    return commands;
  }

  commands.push(
    {
      step: 'generate-bounded-artifact',
      label: 'Generate a bounded exact-host artifact',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--domains',
        hostsCsv,
        '--limit',
        '25',
        '--sample-limit',
        '5',
        '--out',
        artifactPath,
        '--json',
      ]),
      note: 'Read-only graph-feedback generation through sibling repo APIs; writes only the explicit bounded artifact.',
    },
    {
      step: 'compare-profile-hosts',
      label: 'Compare artifact hosts to profile hosts',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--from-artifact',
        artifactPath,
        '--profile',
        profileIdentifier,
        '--compare-hosts',
        '--pretty',
      ]),
      note: 'File-only exact-host comparison; mismatches are reported without starting a crawl.',
    },
    {
      step: 'validate-artifact',
      label: 'Strictly validate the artifact for this profile',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--from-artifact',
        artifactPath,
        '--profile',
        profileIdentifier,
        '--json',
      ]),
      note: 'File-only schema, host, limit, sample, count, URL-length, and size validation.',
    },
    {
      step: 'profile-preflight-text',
      label: 'Print a human preflight summary',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--profile-preflight',
        '--profile',
        profileIdentifier,
        '--from-artifact',
        artifactPath,
        '--preflight-format',
        'text',
      ]),
      note: 'File-only preflight text with readiness, artifact age/warnings, host match, and next safe command.',
    },
    {
      step: 'compact-operator-report',
      label: 'Write a compact operator report',
      command: renderShellCommand([
        'node',
        'tools/crawl/graph-feedback.js',
        '--operator-report',
        '--profile',
        profileIdentifier,
        '--from-artifact',
        artifactPath,
        '--report-commands',
        'minimal',
        '--format',
        'markdown',
      ]),
      note: 'File-only report with readiness evidence and minimal safe commands; no candidate URL dumps.',
    },
    {
      step: 'preview-profile-planning',
      label: 'Preview the canonical profile dry-run',
      command: renderShellCommand(buildProfileDryRunArgs(profileIdentifier, artifactPath, options.profileDir)),
      note: 'Unified launcher profile dry-run; no crawler is started or seeded.',
    }
  );

  return commands;
}

async function loadArtifactProfilePlan(profileName, opts, deps = {}) {
  const loader = deps.loadCrawlProfileHostPlan || loadCrawlProfileHostPlan;
  return loader(profileName, {
    profileDir: opts.profileDir,
    fs: deps.profileFs,
  });
}

function resolveProfileAwareDomains(explicitDomains, profilePlan, options = {}) {
  const explicitHosts = normalizeDomains(explicitDomains || []);
  if (!profilePlan) return explicitHosts;

  const profileHosts = normalizeDomains(profilePlan.hosts || []);
  if (!profileHosts.length) {
    if (options.requireStaticHosts) {
      throw new Error(`Profile ${profilePlan.profileName || profilePlan.profilePath || '<unknown>'} does not expose static hosts; cannot validate graph-feedback artifact`);
    }
    return explicitHosts;
  }

  if (explicitHosts.length) {
    assertHostSetsAgree(explicitHosts, profileHosts, profilePlan);
  }

  return profileHosts;
}

function assertHostSetsAgree(explicitHosts, profileHosts, profilePlan) {
  const explicitSet = new Set(explicitHosts);
  const profileSet = new Set(profileHosts);
  const missingFromProfile = explicitHosts.filter(host => !profileSet.has(host));
  const missingFromExplicit = profileHosts.filter(host => !explicitSet.has(host));
  if (!missingFromProfile.length && !missingFromExplicit.length) return;

  throw new Error([
    `Requested --domains do not match --profile ${profilePlan.profileName || profilePlan.profilePath || '<unknown>'}`,
    `profileHosts=${profileHosts.join(',') || '(none)'}`,
    `requestedHosts=${explicitHosts.join(',') || '(none)'}`,
    `missingFromProfile=${missingFromProfile.join(',') || '(none)'}`,
    `missingFromRequested=${missingFromExplicit.join(',') || '(none)'}`,
  ].join('; '));
}

function summarizeProfilePlan(profilePlan) {
  if (!profilePlan) return null;
  return {
    profileName: profilePlan.profileName || null,
    profileIdentifier: profilePlan.profileIdentifier || profilePlan.profileName || null,
    profilePath: profilePlan.profilePath || null,
    tool: profilePlan.tool || null,
    positionals: Array.isArray(profilePlan.positionals) ? profilePlan.positionals.slice() : [],
    hosts: normalizeDomains(profilePlan.hosts || []),
    hasStaticHosts: Boolean(profilePlan.hasStaticHosts),
    hostSources: Array.isArray(profilePlan.hostSources) ? profilePlan.hostSources.map(source => ({
      field: source.field,
      hosts: normalizeDomains(source.hosts || []),
    })) : [],
    caveats: Array.isArray(profilePlan.caveats) ? profilePlan.caveats.slice() : [],
  };
}

function pushProfileDirArg(args, profileDir) {
  const normalized = String(profileDir || '').trim();
  if (normalized && path.resolve(normalized) !== path.resolve(DEFAULT_PROFILE_DIR)) {
    args.push('--profile-dir', normalized);
  }
}

function buildProfileDryRunArgs(profileIdentifier, artifactPath, profileDir) {
  const args = [
    'node',
    'tools/crawl/index.js',
    profileIdentifier,
    '--dry-run',
    '--graph-feedback-artifact',
    artifactPath,
  ];
  pushProfileDirArg(args, profileDir);
  return args;
}

function renderShellCommand(args) {
  return args.map(quoteShellArg).join(' ');
}

function quoteShellArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function splitCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || '').toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  throw new Error(`Expected boolean value, got: ${value}`);
}

function parseMode(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'full' || normalized === 'fast') return normalized;
  throw new Error(`Expected graph feedback mode full or fast, got: ${value}`);
}

function parseReportFormat(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'json' || normalized === 'markdown') return normalized;
  throw new Error(`Expected report format json or markdown, got: ${value}`);
}

function parsePreflightFormat(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'json' || normalized === 'text') return normalized;
  throw new Error(`Expected preflight format json or text, got: ${value}`);
}

function parseWorkflowFormat(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'json' || normalized === 'markdown') return normalized;
  throw new Error(`Expected workflow format json or markdown, got: ${value}`);
}

function parseReportCommands(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'full' || normalized === 'minimal' || normalized === 'none') return normalized;
  throw new Error(`Expected report commands full, minimal, or none, got: ${value}`);
}

function parseReportMaxProfiles(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected --report-max-profiles to be a positive integer, got: ${value}`);
  }
  return parsed;
}

function validateOperatorReportOptions(opts) {
  if (opts.profilePreflight || opts.profileSummary || opts.recipe || opts.compareHosts) {
    throw new Error('--operator-report cannot be combined with --profile-preflight, --profile-summary, --recipe, or --compare-hosts');
  }
  if (opts.domains.length) {
    throw new Error('--operator-report uses profile hosts only; use --profile instead of --domains');
  }
  if (opts.allCommonProfiles && opts.profileNames.length) {
    throw new Error('--operator-report accepts either --all-common-profiles or explicit --profile values, not both');
  }
  if (!opts.allCommonProfiles && !opts.profileNames.length) {
    throw new Error('--operator-report requires --profile <name> or --all-common-profiles');
  }
  if (opts.preflightFormat !== 'json') {
    throw new Error('--preflight-format is only supported with --profile-preflight');
  }
  if (opts.reportMaxProfiles !== undefined && opts.reportMaxProfiles > MAX_OPERATOR_REPORT_PROFILES) {
    throw new Error(`--report-max-profiles must be <= ${MAX_OPERATOR_REPORT_PROFILES}`);
  }
}

function validateProfileWorkflowOptions(opts) {
  if (opts.operatorReport || opts.profilePreflight || opts.profileSummary || opts.recipe || opts.compareHosts) {
    throw new Error('--profile-workflow cannot be combined with --operator-report, --profile-preflight, --profile-summary, --recipe, or --compare-hosts');
  }
  if (opts.profileNames.length !== 1) {
    throw new Error('--profile-workflow requires exactly one --profile');
  }
  if (opts.domains.length) {
    throw new Error('--profile-workflow uses profile hosts only; use --profile instead of --domains');
  }
  if (opts.allCommonProfiles) {
    throw new Error('--profile-workflow accepts one explicit --profile, not --all-common-profiles');
  }
  if (opts.reportMaxProfiles !== undefined || opts.reportCommands !== 'full' || opts.reportFormat !== 'json') {
    throw new Error('--profile-workflow does not accept operator-report options');
  }
  if (opts.preflightFormat !== 'json') {
    throw new Error('--preflight-format is only supported with --profile-preflight');
  }
}

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase();
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function slugifyProfileName(value) {
  return String(value || 'profile')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profile';
}

function usage() {
  return `graph-feedback.js — read-only crawler graph feedback dry run

Usage:
  node tools/crawl/graph-feedback.js --domains bbc.com,theguardian.com --limit 25 --json
  node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --json
  node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --compare-hosts --pretty
  node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --profile simple-distributed-smoke --compare-hosts --pretty
  node tools/crawl/graph-feedback.js --profile-summary --pretty
  node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-plan.json --pretty
  node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-plan.json --preflight-format text
  node tools/crawl/graph-feedback.js --operator-report --all-common-profiles --format markdown --out tmp/graph-feedback-operator-report.md
  node tools/crawl/graph-feedback.js --profile-workflow --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-plan.json --workflow-format markdown
  node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --recipe --pretty

Options:
  --domain <host>              Add one host to analyze
  --domains <csv>              Add comma-separated hosts to analyze
  --db <path>                  SQLite DB path (default: ${DEFAULT_DB_PATH})
  --limit <n>                  Bounded recommendation rows per host
  --sample-limit <n>           Bounded diagnostic samples per host
  --fetched-only               Restrict hub/orphan/dead-end discovery to fetched pages
  --include-fetched <bool>     Include already-fetched rows in priority features
  --no-include-fetched         Exclude already-fetched rows from priority features
  --stale-before <iso>         Stale threshold passed to GraphAccess
  --stale-fetched-before <iso> Crawler-facing stale threshold alias
  --generated-at <iso>         Stable timestamp for deterministic artifacts
  --fast                       Fast populated-host mode: priority features only
  --mode <full|fast>           Analysis mode (default: full)
  --out <path>                 Write the bounded JSON plan artifact to a file
  --from-artifact <path>       Read a saved graph-feedback artifact and print planning-only seed consideration JSON
  --profile <name|path>        Use static hosts from a crawl profile in profile-aware artifact, summary, preflight, workflow, and report modes
  --profile-dir <path>         Directory for named crawl profiles (default: ${DEFAULT_PROFILE_DIR})
  --profile-summary            Print file-only static host compatibility for common or supplied profiles
  --profile-preflight          Print a file-only profile/artifact preflight report and next safe commands
  --preflight-format <json|text>  Output format for --profile-preflight (default: json)
  --profile-workflow           Print a file-only profile workflow checklist tying artifact generation, validation, reports, and dry-run preview together
  --workflow-format <json|markdown>  Output format for --profile-workflow (default: json)
  --operator-report            Print a file-only multi-profile operator report
  --all-common-profiles        With --operator-report: include the common profile compatibility set
  --report-format <json|markdown>  Output format for --operator-report (default: json)
  --report-commands <full|minimal|none>  Command verbosity for --operator-report (default: full)
  --report-max-profiles <n>    Limit --operator-report profile count (max ${MAX_OPERATOR_REPORT_PROFILES})
  --compare-hosts              With --from-artifact: compare requested/planned hosts to artifact hosts
  --recipe                     With --from-artifact: print compact artifact-derived preview commands as JSON
  --pretty                     Pretty-print JSON
  --json                       Accepted for consistency; JSON is the default machine-readable output
  --help                       Show this help
`;
}

if (require.main === module) {
  run().catch(err => {
    process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  ARTIFACT_SCHEMA_VERSION,
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_URL_LENGTH,
  MAX_OPERATOR_REPORT_PROFILES,
  STALE_ARTIFACT_WARNING_DAYS,
  buildArtifactHostComparison,
  buildArtifactHostComparisonFromPlan,
  buildArtifactEvidence,
  buildArtifactPlanningDryRun,
  buildArtifactPlanningDryRunFromPlan,
  buildArtifactWorkflowRecipe,
  buildCandidateConsiderations,
  buildOperatorReport,
  buildOperatorReadinessSummary,
  buildProfileReadiness,
  buildProfilePreflightReport,
  buildProfileWorkflowChecklist,
  resolveProfileAwareDomains,
  parseArgs,
  parseBoolean,
  parseMode,
  parsePreflightFormat,
  parseReportCommands,
  parseReportFormat,
  parseReportMaxProfiles,
  parseWorkflowFormat,
  readGraphFeedbackArtifactFile,
  readJsonArtifact,
  renderOperatorReportMarkdown,
  renderProfilePreflightText,
  renderProfileWorkflowChecklistMarkdown,
  run,
  usage,
  validateGraphFeedbackArtifact,
  writeTextArtifact,
  writeJsonArtifact,
};
