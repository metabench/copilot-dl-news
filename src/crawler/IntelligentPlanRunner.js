class IntelligentPlanRunner {
  constructor({
    telemetry,
    domain,
    baseUrl,
    startUrl,
    plannerEnabled,
    plannerVerbosity,
    intTargetHosts,
    fetchPage,
    getCachedArticle,
    dbAdapter,
    plannerKnowledgeService,
    enqueueRequest,
    normalizeUrl,
    state,
    intMaxSeeds = 50,
    logger = console,
    PlannerTelemetryBridge,
    PlannerOrchestrator,
    PlannerBootstrap,
    PatternInference,
    CountryHubPlanner,
    HubSeeder,
    TargetedAnalysisRunner,
    NavigationDiscoveryRunner,
    enableTargetedAnalysis = true
  } = {}) {
    if (!telemetry || !domain || !baseUrl || !startUrl) {
      throw new Error('IntelligentPlanRunner requires telemetry, domain, baseUrl, and startUrl');
    }
    if (typeof fetchPage !== 'function') {
      throw new Error('IntelligentPlanRunner requires a fetchPage function');
    }
    if (typeof getCachedArticle !== 'function') {
      throw new Error('IntelligentPlanRunner requires a getCachedArticle function');
    }
    if (typeof enqueueRequest !== 'function' || typeof normalizeUrl !== 'function') {
      throw new Error('IntelligentPlanRunner requires enqueueRequest and normalizeUrl functions');
    }
    if (!PlannerTelemetryBridge || !PlannerOrchestrator || !PlannerBootstrap || !PatternInference || !CountryHubPlanner || !HubSeeder || !NavigationDiscoveryRunner) {
      throw new Error('IntelligentPlanRunner requires planner constructors');
    }
    if (enableTargetedAnalysis !== false && !TargetedAnalysisRunner) {
      throw new Error('IntelligentPlanRunner requires TargetedAnalysisRunner when targeted analysis is enabled');
    }

    this.telemetry = telemetry;
    this.domain = domain;
    this.baseUrl = baseUrl;
    this.startUrl = startUrl;
    this.plannerEnabled = plannerEnabled;
    this.plannerVerbosity = typeof plannerVerbosity === 'number' ? plannerVerbosity : 0;
    this.intTargetHosts = Array.isArray(intTargetHosts) ? intTargetHosts : null;
    this.fetchPage = fetchPage;
    this.getCachedArticle = getCachedArticle;
    this.dbAdapter = dbAdapter;
    this.plannerKnowledgeService = plannerKnowledgeService;
    this.enqueueRequest = enqueueRequest;
    this.normalizeUrl = normalizeUrl;
    this.state = state;
    this.intMaxSeeds = typeof intMaxSeeds === 'number' ? intMaxSeeds : 50;
    this.logger = logger;

    this.PlannerTelemetryBridge = PlannerTelemetryBridge;
    this.PlannerOrchestrator = PlannerOrchestrator;
    this.PlannerBootstrap = PlannerBootstrap;
    this.PatternInference = PatternInference;
    this.CountryHubPlanner = CountryHubPlanner;
    this.HubSeeder = HubSeeder;
    this.TargetedAnalysisRunner = TargetedAnalysisRunner;
    this.NavigationDiscoveryRunner = NavigationDiscoveryRunner;
    this.enableTargetedAnalysis = enableTargetedAnalysis !== false;
  }

  async run() {
    const host = this.domain.toLowerCase();
    this._log(`Intelligent crawl planning for host=${host}`);

    const telemetryBridge = new this.PlannerTelemetryBridge({
      telemetry: this.telemetry,
      domain: host,
      logger: this.logger
    });

    const orchestrator = new this.PlannerOrchestrator({
      telemetryBridge,
      logger: this.logger,
      enabled: this.plannerEnabled
    });

    const plannerBootstrap = new this.PlannerBootstrap({
      telemetry: telemetryBridge,
      plannerVerbosity: this.plannerVerbosity
    });

    const bootstrapResult = await orchestrator.runStage('bootstrap', {
      host,
      targetHosts: Array.isArray(this.intTargetHosts) && this.intTargetHosts.length ? this.intTargetHosts : undefined
    }, () => plannerBootstrap.run({
      host,
      targetHosts: this.intTargetHosts
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          allowed: res.allowed !== false,
          skipped: !!res.skipPlan,
          plannerVerbosity: res.plannerVerbosity,
          targetHosts: Array.isArray(res.targetHosts) && res.targetHosts.length ? res.targetHosts : undefined
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        bootstrap: {
          allowed: res?.allowed !== false,
          skipPlan: !!res?.skipPlan,
          targetHosts: Array.isArray(res?.targetHosts) && res.targetHosts.length ? res.targetHosts : null,
          plannerVerbosity: res?.plannerVerbosity ?? this.plannerVerbosity
        }
      })
    });

    if (bootstrapResult?.skipPlan) {
      const summary = orchestrator.buildSummary({
        seededCount: 0,
        requestedCount: 0,
        sectionHubCount: 0,
        countryCandidateCount: 0,
        sampleSeeded: [],
        learnedSectionCount: 0,
        learnedSectionsPreview: []
      });
      return {
        plannerSummary: summary,
        intelligentSummary: summary
      };
    }

    const patternInference = new this.PatternInference({
      fetchPage: this.fetchPage,
      getCachedArticle: this.getCachedArticle,
      telemetry: telemetryBridge,
      baseUrl: this.baseUrl,
      domain: this.domain,
      logger: this.logger
    });

    const patternResult = await orchestrator.runStage('infer-patterns', {
      startUrl: this.startUrl
    }, () => patternInference.run({
      startUrl: this.startUrl
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        const sections = Array.isArray(res.learned?.sections) ? res.learned.sections : [];
        const hints = Array.isArray(res.learned?.articleHints) ? res.learned.articleHints : [];
        return {
          sectionCount: sections.length,
          sectionsPreview: sections.slice(0, 6),
          articleHintsCount: hints.length,
          articleHintsPreview: hints.slice(0, 6),
          homepageSource: res.fetchMeta?.source || null,
          notModified: !!res.fetchMeta?.notModified,
          hadError: !!res.fetchMeta?.error
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        learnedSections: Array.isArray(res?.learned?.sections) ? res.learned.sections : [],
        articleHints: Array.isArray(res?.learned?.articleHints) ? res.learned.articleHints : []
      })
    });

    const learnedSections = Array.isArray(patternResult?.learned?.sections) ? patternResult.learned.sections : [];

    let navigationDiscoveryResult = null;
    let navigationLinkCandidates = [];

    if (this.NavigationDiscoveryRunner) {
      const navigationRunner = new this.NavigationDiscoveryRunner({
        fetchPage: this.fetchPage,
        getCachedArticle: this.getCachedArticle,
        baseUrl: this.baseUrl,
        normalizeUrl: this.normalizeUrl,
        logger: this.logger,
        maxPages: Math.min(5, Math.max(1, Math.floor(this.intMaxSeeds / 10) || 3)),
        maxLinksPerPage: 80
      });

      const navSeeds = this._buildNavigationSeeds({
        startUrl: this.startUrl,
        sectionSlugs: learnedSections,
        articleHints: Array.isArray(patternResult?.learned?.articleHints)
          ? patternResult.learned.articleHints
          : []
      });

      navigationDiscoveryResult = await orchestrator.runStage('navigation-discovery', {
        startUrl: this.startUrl,
        seedCount: navSeeds.length
      }, () => navigationRunner.run({
        startUrl: this.startUrl,
        seeds: navSeeds
      }), {
        mapResultForEvent: (res) => this._mapNavigationResult(res),
        updateSummaryWithResult: (summary = {}, res) => ({
          ...summary,
          navigation: this._summariseNavigation(res)
        })
      });

      navigationLinkCandidates = Array.isArray(navigationDiscoveryResult?.merged?.links)
        ? navigationDiscoveryResult.merged.links.slice(0, Math.max(6, Math.min(20, this.intMaxSeeds)))
        : [];
    }

    const countryHubPlanner = new this.CountryHubPlanner({
      baseUrl: this.baseUrl,
      db: this.dbAdapter,
      knowledgeService: this.plannerKnowledgeService
    });

    const countryCandidates = await orchestrator.runStage('country-hubs', {
      host
    }, () => countryHubPlanner.computeCandidates(host), {
      mapResultForEvent: (res) => {
        if (!Array.isArray(res)) {
          return {
            candidateCount: 0
          };
        }
        return {
          candidateCount: res.length,
          sample: res.slice(0, 5).map((c) => c?.url).filter(Boolean)
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        countryCandidates: Array.isArray(res) ? res : []
      })
    }) || [];

    const maxSeeds = this.intMaxSeeds;
    const hubSeeder = new this.HubSeeder({
      enqueueRequest: this.enqueueRequest,
      normalizeUrl: this.normalizeUrl,
      state: this.state,
      telemetry: telemetryBridge,
      db: this.dbAdapter,
      baseUrl: this.baseUrl,
      logger: this.logger
    });

    const seedResult = await orchestrator.runStage('seed-hubs', {
      sectionsFromPatterns: learnedSections.length,
      candidateCount: countryCandidates.length,
      maxSeeds
    }, () => hubSeeder.seedPlan({
      host,
      sectionSlugs: learnedSections,
      countryCandidates,
      maxSeeds,
      navigationLinks: navigationLinkCandidates
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          seededCount: res.seededCount || 0,
          requestedCount: res.requestedCount || 0,
          sectionHubCount: res.sectionHubCount || 0,
          countryCandidateCount: res.countryCandidateCount || 0,
          navigationSeededCount: res.navigationSeededCount || 0,
          navigationCandidateCount: res.navigationCandidateCount || 0,
          sampleSeeded: Array.isArray(res.sampleSeeded) ? res.sampleSeeded.slice(0, 3) : undefined,
          navigationSample: Array.isArray(res.navigationSample) ? res.navigationSample.slice(0, 3) : undefined
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        seedResult: res || null
      })
    });

    let targetedAnalysisResult = null;

    if (this.enableTargetedAnalysis && this.TargetedAnalysisRunner) {
      const targetedAnalyzer = new this.TargetedAnalysisRunner({
        fetchPage: this.fetchPage,
        getCachedArticle: this.getCachedArticle,
        baseUrl: this.baseUrl,
        domain: this.domain,
        maxSamples: Math.min(5, Math.max(1, Math.floor(this.intMaxSeeds / 5) || 3)),
        logger: this.logger
      });
      const seedSamples = Array.isArray(seedResult?.sampleSeeded) ? seedResult.sampleSeeded : [];
      const targetSections = learnedSections.slice();
      const inferenceHints = Array.isArray(patternResult?.learned?.articleHints)
        ? patternResult.learned.articleHints
        : [];

      targetedAnalysisResult = await orchestrator.runStage('targeted-analysis', {
        seedSamples: seedSamples.length,
        sampleLimit: targetedAnalyzer.maxSamples,
        sections: targetSections.slice(0, 8)
      }, () => targetedAnalyzer.run({
        seeds: seedSamples,
        sections: targetSections,
        articleHints: inferenceHints
      }), {
        mapResultForEvent: (res) => this._mapTargetedAnalysisResult(res),
        updateSummaryWithResult: (summary = {}, res) => ({
          ...summary,
          targetedAnalysis: this._summariseTargetedAnalysis(res)
        })
      });
    }

    const plannerSummary = orchestrator.buildSummary({
      learnedSectionCount: learnedSections.length,
      learnedSectionsPreview: learnedSections.slice(0, 8),
      navigation: this._summariseNavigation(navigationDiscoveryResult),
      targetedAnalysis: this._summariseTargetedAnalysis(targetedAnalysisResult)
    });

    const intelligentSummary = {
      seededCount: seedResult?.seededCount || 0,
      requestedCount: seedResult?.requestedCount || 0,
      sectionHubCount: seedResult?.sectionHubCount || learnedSections.length,
      countryCandidateCount: seedResult?.countryCandidateCount || countryCandidates.length,
      sampleSeeded: Array.isArray(seedResult?.sampleSeeded) ? seedResult.sampleSeeded.slice(0, 5) : [],
      learnedSectionCount: learnedSections.length,
      learnedSectionsPreview: learnedSections.slice(0, 8),
      navigation: this._summariseNavigation(navigationDiscoveryResult),
      navigationEntryPoints: navigationLinkCandidates.slice(0, 6).map((entry) => ({
        url: entry?.url,
        labels: Array.isArray(entry?.labels) ? entry.labels.slice(0, 2) : []
      })),
      navigationSeeds: {
        candidates: Number(seedResult?.navigationCandidateCount) || navigationLinkCandidates.length || 0,
        seeded: Number(seedResult?.navigationSeededCount) || 0,
        sample: Array.isArray(seedResult?.navigationSample) ? seedResult.navigationSample.slice(0, 5) : []
      },
      targetedAnalysis: this._summariseTargetedAnalysis(targetedAnalysisResult),
      ...plannerSummary
    };

    return {
      plannerSummary,
      intelligentSummary
    };
  }

  _log(message) {
    try {
      if (typeof this.logger?.log === 'function') {
        this.logger.log(message);
      }
    } catch (_) {}
  }

  _mapNavigationResult(res) {
    const summary = this._summariseNavigation(res);
    const topLabels = summary.topLinks
      .map((entry) => (Array.isArray(entry.labels) && entry.labels.length ? entry.labels[0] : entry.url))
      .filter(Boolean);
    const highlightParts = [];
    if (summary.totalLinks) {
      highlightParts.push(`Mapped ${summary.totalLinks} navigation link${summary.totalLinks === 1 ? '' : 's'}`);
    } else {
      highlightParts.push('Navigation discovery found no prominent links');
    }
    if (summary.primary || summary.secondary) {
      const primaryLabel = summary.primary ? `${summary.primary} primary` : null;
      const secondaryLabel = summary.secondary ? `${summary.secondary} secondary` : null;
      const combined = [primaryLabel, secondaryLabel].filter(Boolean).join(' · ');
      if (combined) {
        highlightParts.push(combined);
      }
    }
    if (!summary.totalLinks && summary.categories) {
      highlightParts.push(`${summary.categories} category links`);
    }
    if (topLabels.length) {
      highlightParts.push(`Top paths: ${topLabels.slice(0, 3).join(', ')}`);
    }
    const now = Date.now();
    const goalsCompleted = summary.primary + summary.secondary;
    const goalsTotal = Math.max(summary.totalLinks, goalsCompleted, 1);

    return {
      totalLinks: summary.totalLinks,
      primary: summary.primary,
      secondary: summary.secondary,
      categories: summary.categories,
      meta: summary.meta,
      topLinks: summary.topLinks.slice(0, 5),
      samples: summary.samples,
      navigationSummary: summary,
      analysisHighlights: highlightParts.slice(0, 4),
      details: {
        navigation: summary,
        navigationTopLinks: summary.topLinks.slice(0, 10)
      },
      pipelinePatch: {
        planner: {
          status: summary.totalLinks ? 'ready' : 'pending',
          statusLabel: summary.totalLinks ? 'Mapped' : 'Pending',
          stage: 'Navigation discovery',
          summary: highlightParts[0],
          goals: {
            completed: goalsCompleted,
            total: goalsTotal
          },
          goalSummary: goalsTotal ? `${goalsCompleted}/${goalsTotal} nav anchors mapped` : '—',
          updatedAt: now
        }
      }
    };
  }

  _summariseNavigation(res) {
    if (!res || typeof res !== 'object') {
      return {
        totalLinks: 0,
        primary: 0,
        secondary: 0,
        categories: 0,
        meta: 0,
        analysedPages: 0,
        topLinks: [],
        samples: [],
        focusSections: []
      };
    }
    const summary = res.summary && typeof res.summary === 'object' ? res.summary : {};
    const topLinksRaw = Array.isArray(summary.topLinks) ? summary.topLinks : [];
    const topLinks = topLinksRaw.slice(0, 12).map((entry) => ({
      url: entry?.url || null,
      labels: Array.isArray(entry?.labels) ? entry.labels.slice(0, 3) : [],
      type: entry?.type || 'other',
      occurrences: Number(entry?.occurrences) || 0
    }));
    const samples = Array.isArray(summary.samples)
      ? summary.samples.slice(0, 5).map((sample) => ({
          url: sample?.url || null,
          linkCount: Number(sample?.linkCount) || 0,
          examples: Array.isArray(sample?.examples) ? sample.examples.slice(0, 5) : []
        }))
      : [];

    const sectionCounts = new Map();
    for (const link of topLinks) {
      const section = this._extractSectionFromUrl(link.url);
      if (!section) continue;
      sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1);
    }
    const focusSections = Array.from(sectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([section, count]) => ({ section, count }));

    return {
      totalLinks: Number(summary.totalLinks) || topLinksRaw.length || 0,
      primary: Number(summary.primary) || 0,
      secondary: Number(summary.secondary) || 0,
      categories: Number(summary.categories) || 0,
      meta: Number(summary.meta) || 0,
      analysedPages: Array.isArray(res.analysedPages) ? res.analysedPages.length : Number(summary.analysedPages) || 0,
      topLinks,
      samples,
      focusSections
    };
  }

  _extractSectionFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const { pathname } = new URL(url, this.baseUrl);
      const parts = (pathname || '/').split('/').filter(Boolean);
      if (!parts.length) return null;
      return parts[0].toLowerCase();
    } catch (_) {
      return null;
    }
  }

  _buildNavigationSeeds({ startUrl, sectionSlugs = [], articleHints = [] } = {}) {
    const seeds = new Set();
    if (startUrl) seeds.add(startUrl);
    if (this.baseUrl) seeds.add(this.baseUrl);
    const hints = Array.isArray(articleHints) ? articleHints : [];
    for (const hint of hints) {
      if (typeof hint !== 'string' || !hint) continue;
      seeds.add(hint);
      if (seeds.size >= 12) break;
    }
    if (seeds.size < 12) {
      const slugs = Array.isArray(sectionSlugs) ? sectionSlugs : [];
      for (const slug of slugs) {
        if (!slug) continue;
        try {
          const candidate = new URL(String(slug).replace(/^[\/]+/, ''), this.baseUrl).toString();
          seeds.add(candidate);
        } catch (_) {}
        if (seeds.size >= 12) break;
      }
    }
    return Array.from(seeds).filter(Boolean).slice(0, 12);
  }

  _mapTargetedAnalysisResult(res) {
    if (!res || typeof res !== 'object') {
      return {
        analysedCount: 0,
        sectionsCovered: [],
        analysisHighlights: [
          'Targeted analysis skipped (no samples available)'
        ]
      };
    }
    const samples = Array.isArray(res.samples) ? res.samples : [];
    const analysedCount = samples.length;
    const sectionsCovered = Array.isArray(res.coverage?.sectionsCovered)
      ? res.coverage.sectionsCovered.map((entry) => entry.section).filter(Boolean)
      : [];
    const avgWordCount = Number(res.coverage?.avgWordCount) || 0;
    const topKeywords = Array.isArray(res.topKeywords)
      ? res.topKeywords.slice(0, 6).map((entry) => entry.phrase)
      : [];
    const highlightParts = [];
    if (analysedCount) {
      highlightParts.push(`Analysed ${analysedCount} targeted seed${analysedCount === 1 ? '' : 's'}`);
    } else {
      highlightParts.push('No targeted seeds available for analysis');
    }
    if (sectionsCovered.length) {
      highlightParts.push(`Sections covered: ${sectionsCovered.slice(0, 3).join(', ')}`);
    }
    if (avgWordCount > 0) {
      highlightParts.push(`Avg word count ${avgWordCount}`);
    }
    if (topKeywords.length) {
      highlightParts.push(`Top keywords: ${topKeywords.slice(0, 3).join(', ')}`);
    }
    const now = Date.now();
    return {
      analysedCount,
      sectionsCovered,
      avgWordCount,
      topKeywords,
      samples: samples.slice(0, 5).map((sample) => ({
        url: sample.url,
        section: sample.section,
        headline: sample.headline,
        classification: sample.classification,
        wordCount: sample.wordCount,
        keyPhrases: Array.isArray(sample.keyPhrases) ? sample.keyPhrases.slice(0, 3) : []
      })),
      analysisHighlights: highlightParts,
      pipelinePatch: {
        analysis: {
          status: analysedCount ? 'ready' : 'pending',
          statusLabel: analysedCount ? 'Targeted' : 'Pending',
          summary: highlightParts[0] || 'Targeted analysis update',
          signals: topKeywords.slice(0, 4),
          lastRun: now,
          updatedAt: now
        }
      }
    };
  }

  _summariseTargetedAnalysis(res) {
    if (!res || typeof res !== 'object') {
      return {
        sampleSize: 0,
        sectionsCovered: [],
        avgWordCount: 0,
        topKeywords: []
      };
    }
    const samples = Array.isArray(res.samples) ? res.samples : [];
    const sectionsCovered = Array.isArray(res.coverage?.sectionsCovered)
      ? res.coverage.sectionsCovered
      : [];
    const summary = {
      sampleSize: samples.length,
      sectionsCovered,
      avgWordCount: Number(res.coverage?.avgWordCount) || 0,
      coveragePct: Number(res.coverage?.coveragePct) || 0,
      expectedSections: Number(res.coverage?.expectedSections) || 0,
      topKeywords: Array.isArray(res.topKeywords) ? res.topKeywords.slice(0, 6) : [],
      samples: samples.slice(0, 5).map((sample) => ({
        url: sample.url,
        section: sample.section,
        classification: sample.classification,
        wordCount: sample.wordCount,
        keyPhrases: Array.isArray(sample.keyPhrases) ? sample.keyPhrases.slice(0, 3) : []
      }))
    };
    return summary;
  }
}

module.exports = {
  IntelligentPlanRunner
};
