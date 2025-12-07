"use strict";

const { createSequenceRunner } = require("../orchestration/SequenceRunner");

function normalizeResult(result) {
  if (result && typeof result === "object" && typeof result.status === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    return { status: "ok", ...result };
  }
  return { status: "ok" };
}

function createTelemetryAdapter(crawler) {
  const maybeMilestone = (key, payload) => {
    const telemetry = crawler?.telemetry;
    if (!telemetry || typeof telemetry.milestoneOnce !== "function") return;
    telemetry.milestoneOnce(key, payload);
  };

  return {
    onSequenceStart: (payload) => {
      const sequenceName = payload.sequence?.sequenceName || "unknown";
      maybeMilestone(`sequence:start:${sequenceName}`, {
        kind: "sequence-start",
        message: `Starting sequence ${sequenceName}`,
        details: payload
      });
    },
    onSequenceComplete: (payload) => {
      const sequenceName = payload.sequence?.sequenceName || "unknown";
      maybeMilestone(`sequence:complete:${sequenceName}`, {
        kind: "sequence-complete",
        message: `Completed sequence ${sequenceName}`,
        details: payload
      });
    },
    onStepEvent: (payload) => {
      const stepId = payload.step?.id || "unknown";
      maybeMilestone(`sequence:step:${stepId}`, {
        kind: "sequence-step",
        message: `Step ${stepId}: ${payload.event}`,
        details: payload
      });
    }
  };
}

function createOperations(crawler) {
  const wrap = (handler) => async (_startUrl, overrides = {}) => {
    try {
      const result = await handler(overrides || {});
      return normalizeResult(result);
    } catch (error) {
      crawler._lastSequenceError = error;
      throw error;
    }
  };

  const operations = {
    init: wrap(async () => {
      await crawler.init();
    }),
    planner: wrap(async () => {
      await crawler._runPlannerStage();
    }),
    sitemaps: wrap(async () => {
      await crawler._runSitemapStage();
    }),
    seedStartUrl: wrap(async (overrides) => {
      crawler._seedInitialRequest(overrides);
    }),
    markStartupComplete: wrap(async (overrides) => {
      const message = overrides && typeof overrides.message === "string"
        ? overrides.message
        : overrides && typeof overrides.statusText === "string"
          ? overrides.statusText
          : null;
      crawler._markStartupComplete(message);
    }),
    runSequentialLoop: wrap(async () => {
      await crawler._runSequentialLoop();
    }),
    runConcurrentWorkers: wrap(async () => {
      await crawler._runConcurrentWorkers();
    }),
    runGazetteerMode: wrap(async () => {
      await crawler._runGazetteerMode();
    })
  };

  operations.listOperations = () => [
    "init",
    "planner",
    "sitemaps",
    "seedStartUrl",
    "markStartupComplete",
    "runSequentialLoop",
    "runConcurrentWorkers",
    "runGazetteerMode"
  ];

  return operations;
}

function createStartupSequenceBuilder(crawler) {
  return function buildStartupSequence(mode) {
    const metadata = {
      sequenceName: `newsCrawler:${mode}`,
      mode
    };

    if (mode === "gazetteer") {
      return {
        metadata,
        startUrl: crawler.startUrl,
        steps: [
          { id: "init", operation: "init", label: "Initialize crawler" },
          { id: "gazetteer", operation: "runGazetteerMode", label: "Run gazetteer mode" }
        ]
      };
    }

    const steps = [
      { id: "init", operation: "init", label: "Initialize crawler" },
      { id: "planner", operation: "planner", label: "Run planner" },
      { id: "sitemaps", operation: "sitemaps", label: "Load sitemaps" },
      {
        id: "seed-start-url",
        operation: "seedStartUrl",
        label: "Seed start URL",
        overrides: { respectSitemapOnly: mode !== "sequential" }
      },
      { id: "startup-complete", operation: "markStartupComplete", label: "Mark startup complete" }
    ];

    steps.push(mode === "sequential"
      ? { id: "sequential-loop", operation: "runSequentialLoop", label: "Process crawl queue" }
      : { id: "concurrent-workers", operation: "runConcurrentWorkers", label: "Run crawl workers" }
    );

    return {
      metadata,
      startUrl: crawler.startUrl,
      steps
    };
  };
}

function createStartupSequenceController({ crawler, log }) {
  const operations = createOperations(crawler);
  const telemetry = createTelemetryAdapter(crawler);
  const runner = createSequenceRunner({
    operations,
    logger: log,
    telemetry
  });

  const buildStartupSequence = createStartupSequenceBuilder(crawler);

  return {
    runner,
    buildStartupSequence
  };
}

module.exports = {
  createStartupSequenceController
};
