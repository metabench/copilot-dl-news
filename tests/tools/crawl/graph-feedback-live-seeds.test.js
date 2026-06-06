'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildLiveSeedApprovalChecklist,
  buildLiveSeedApprovalReadiness,
  buildPostSeedVerificationChecklist,
  buildPostSeedVerificationEvidence,
  buildPreSeedRemoteUsabilityProof,
  buildGraphFeedbackLiveSeedPlan,
  readLiveSeedApprovalChecklistSync,
  readLiveSeedPreviewEvidenceSync,
  readPostSeedVerificationEvidenceSync,
  validateLiveSeedUrl,
  verifyLiveSeedPreviewEvidence,
  writeLiveSeedApprovalChecklistSync,
  writeLiveSeedApprovalReadinessSync,
  writeLiveSeedPreviewEvidenceSync,
  writePostSeedVerificationChecklistSync,
  writePostSeedVerificationEvidenceSync,
  writeSeedAttemptLogSync,
} = require('../../../tools/crawl/lib/graph-feedback-live-seeds');
const {
  MAX_ARTIFACT_URL_LENGTH,
} = require('../../../tools/crawl/graph-feedback');
const {
  makeGraphFeedbackArtifact,
} = require('./helpers/graph-feedback-fixtures');

describe('graph-feedback live seed preparation', () => {
  function withTempArtifact(artifact, callback) {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-live-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    try {
      return callback(artifactPath);
    } finally {
      try { fs.unlinkSync(artifactPath); } catch (_err) { /* ignore */ }
    }
  }

  test('builds a bounded live seed map from a fresh exact-host artifact', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      expect(plan.mode).toBe('live-seed-plan');
      expect(plan.seedUrlsByDomain).toEqual({ 'bbc.com': ['https://bbc.com/news'] });
      expect(plan.seedUrlsByDomainSpec).toBe('bbc.com=https://bbc.com/news');
      expect(plan.requestBodyBytes).toBeLessThanOrEqual(plan.caps.maxRequestBodyBytes);
      expect(plan.previewEvidence).toEqual(expect.objectContaining({
        mode: 'graph-feedback-live-seed-preview-evidence',
        candidateCount: 1,
        requestBodyBytes: plan.requestBodyBytes,
      }));
      expect(plan.previewEvidence.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(plan.actionPolicy).toEqual(expect.objectContaining({
        enqueueUrls: false,
        seedRemoteCrawlers: true,
        alterCollectBehavior: false,
        requiresExplicitLiveFlag: true,
      }));
    });
  });

  test('writes bounded preview evidence without dumping seed URLs', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-preview-${Date.now()}-${Math.random()}.json`);
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        const evidence = writeLiveSeedPreviewEvidenceSync(evidencePath, plan, {
          generatedAt: '2026-05-26T12:00:00.000Z',
        });
        const raw = fs.readFileSync(evidencePath, 'utf8');
        expect(evidence.fingerprint).toBe(plan.previewEvidence.fingerprint);
        expect(readLiveSeedPreviewEvidenceSync(evidencePath).fingerprint).toBe(plan.previewEvidence.fingerprint);
        expect(raw).not.toContain('https://bbc.com/news');
        expect(verifyLiveSeedPreviewEvidence(plan, evidence)).toEqual({
          ok: true,
          fingerprint: plan.previewEvidence.fingerprint,
        });
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_err) { /* ignore */ }
      }
    });
  });

  test('rejects preview evidence fingerprint mismatches', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      expect(() => verifyLiveSeedPreviewEvidence(plan, {
        ...plan.previewEvidence,
        fingerprint: '0'.repeat(64),
      })).toThrow('fingerprint does not match');
    });
  });

  test('writes bounded seed attempt logs without candidate URL dumps', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const logPath = path.join(os.tmpdir(), `graph-feedback-seed-attempt-${Date.now()}-${Math.random()}.jsonl`);
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        const record = writeSeedAttemptLogSync(logPath, plan, {
          generatedAt: '2026-05-26T12:00:00.000Z',
          delegatedCommand: 'node tools/crawl/crawl-remote.js bounded --domains bbc.com --seed-urls-by-domain bbc.com=https://bbc.com/news',
        });
        const raw = fs.readFileSync(logPath, 'utf8');
        expect(record).toEqual(expect.objectContaining({
          mode: 'graph-feedback-live-seed-attempt',
          candidateCount: 1,
          requestBodyBytes: plan.requestBodyBytes,
        }));
        expect(raw).not.toContain('https://bbc.com/news');
        expect(record.delegatedCommand).toContain('[redacted:graph-feedback-seeds]');
        expect(JSON.parse(raw.trim()).previewFingerprint).toBe(plan.previewEvidence.fingerprint);
      } finally {
        try { fs.unlinkSync(logPath); } catch (_err) { /* ignore */ }
      }
    });
  });

  test('builds a bounded real-remote approval checklist without authorizing live seed', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const checklist = buildLiveSeedApprovalChecklist(plan, {
        previewEvidencePath: 'tmp/preview.json',
        seedAttemptLogPath: 'tmp/attempts.jsonl',
        dryRunCommand: 'node tools/crawl/crawl-remote.js bounded --domains bbc.com --seed-urls-by-domain bbc.com=https://bbc.com/news',
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      expect(checklist.mode).toBe('graph-feedback-live-seed-approval-checklist');
      expect(checklist.approvalReadyForHuman).toBe(true);
      expect(checklist.realSeedAuthorized).toBe(false);
      expect(checklist.explicitApprovalLine).toBe('APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE');
      expect(checklist.constraints).toEqual(expect.objectContaining({
        maxHosts: 1,
        maxCandidates: 3,
        timeoutSeconds: 30,
      }));
      expect(JSON.stringify(checklist)).not.toContain('https://bbc.com/news');
      expect(checklist.commands.dryRunPreview).toContain('[redacted:graph-feedback-seeds]');
      expect(checklist.postSeedVerification.commands.map(command => command.name)).toEqual(expect.arrayContaining([
        'health',
        'status',
        'errors',
        'content',
        'one-round-sync',
        'local-db-recent',
      ]));
      expect(checklist.remoteUsabilityProof.commands.map(command => command.name)).toEqual(expect.arrayContaining([
        'health',
        'status-build',
        'recent-errors',
        'content-probe',
        'deploy-preflight',
      ]));
      expect(checklist.commands.deployPreflight).toContain('deploy-remote-server.js --preflight-only --json');
      expect(checklist.actionPolicy).toEqual(expect.objectContaining({
        dryRunOnly: true,
        requiresSeparateHumanApproval: true,
        seedRemoteCrawlers: false,
      }));
    });
  });

  test('marks approval checklist not ready when smoke caps are exceeded', () => {
    const manyRecommendations = Array.from({ length: 4 }, (_, index) => ({
      url: `https://bbc.com/seed-${index}`,
    }));
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com', {
      limits: {
        perHostLimit: 4,
        sampleLimit: 1,
        maxPerHostLimit: 200,
        maxSampleLimit: 50,
      },
      recommendationCount: 4,
      domainOverrides: { recommendations: manyRecommendations },
    }), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const checklist = buildLiveSeedApprovalChecklist(plan, {
        previewEvidencePath: 'tmp/preview.json',
      });

      expect(checklist.approvalReadyForHuman).toBe(false);
      expect(checklist.checks.find(check => check.name === 'max-three-candidates')).toEqual(expect.objectContaining({
        ok: false,
      }));
    });
  });

  test('writes an approval checklist file within the bounded output cap', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const checklistPath = path.join(os.tmpdir(), `graph-feedback-approval-${Date.now()}-${Math.random()}.json`);
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        const checklist = writeLiveSeedApprovalChecklistSync(checklistPath, plan, {
          previewEvidencePath: 'tmp/preview.json',
          generatedAt: '2026-05-26T12:00:00.000Z',
        });
        const raw = fs.readFileSync(checklistPath, 'utf8');
        expect(checklist.mode).toBe('graph-feedback-live-seed-approval-checklist');
        expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(16 * 1024);
        expect(raw).not.toContain('https://bbc.com/news');
      } finally {
        try { fs.unlinkSync(checklistPath); } catch (_err) { /* ignore */ }
      }
    });
  });

  test('builds dry-run approval readiness from bounded evidence files', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const base = path.join(os.tmpdir(), `graph-feedback-readiness-${Date.now()}-${Math.random()}`);
      const previewPath = `${base}-preview.json`;
      const checklistPath = `${base}-approval.json`;
      const postSeedPath = `${base}-post-seed.json`;
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        writeLiveSeedPreviewEvidenceSync(previewPath, plan, {
          generatedAt: '2026-05-26T12:00:00.000Z',
        });
        writeLiveSeedApprovalChecklistSync(checklistPath, plan, {
          previewEvidencePath: previewPath,
          seedAttemptLogPath: `${base}-attempts.jsonl`,
          generatedAt: '2026-05-26T12:00:00.000Z',
        });
        writePostSeedVerificationEvidenceSync(postSeedPath, plan, {
          generatedAt: '2026-05-26T12:05:00.000Z',
          approvalChecklistPath: checklistPath,
          seedAttemptLogPath: `${base}-attempts.jsonl`,
          checks: [{ name: 'health', ok: true, summary: 'healthy at https://bbc.com/news' }],
        });

        const readiness = buildLiveSeedApprovalReadiness({
          approvalChecklistPath: checklistPath,
          previewEvidencePath: previewPath,
          postSeedEvidencePath: postSeedPath,
          generatedAt: '2026-05-26T12:06:00.000Z',
        });

        expect(readLiveSeedApprovalChecklistSync(checklistPath).mode)
          .toBe('graph-feedback-live-seed-approval-checklist');
        expect(readPostSeedVerificationEvidenceSync(postSeedPath).mode)
          .toBe('graph-feedback-live-seed-post-seed-verification-evidence');
        expect(readiness.mode).toBe('graph-feedback-live-seed-approval-readiness');
        expect(readiness.readyForApproval).toBe(true);
        expect(readiness.realSeedAuthorized).toBe(false);
        expect(readiness.explicitApprovalLine).toBe('APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE');
        expect(readiness.summary).toEqual(expect.objectContaining({
          readyForApproval: true,
          blockerCount: 0,
          plannedHostCount: 1,
          candidateCount: 1,
          seedAttemptLogPath: `${base}-attempts.jsonl`,
        }));
        expect(readiness.remoteUsability).toEqual(expect.objectContaining({
          present: true,
          commandNames: expect.arrayContaining([
            'health',
            'status-build',
            'recent-errors',
            'content-probe',
            'deploy-preflight',
          ]),
          requiredCommandNames: [
            'health',
            'status-build',
            'recent-errors',
            'content-probe',
            'deploy-preflight',
          ],
        }));
        expect(readiness.postSeedVerificationPlan).toEqual(expect.objectContaining({
          present: true,
          commandNames: expect.arrayContaining([
            'health',
            'status',
            'errors',
            'content',
            'one-round-sync',
            'local-db-recent',
          ]),
          rollbackCommandNames: expect.arrayContaining([
            'stop-target-hosts',
            'status-after-stop',
          ]),
          checkNames: [
            'health',
            'status',
            'errors',
            'content',
            'sync-or-pull',
            'local-db-confirmation',
          ],
        }));
        expect(readiness.checks.find(check => check.name === 'preview-evidence-match')).toEqual(expect.objectContaining({
          ok: true,
        }));
        expect(readiness.checks.find(check => check.name === 'remote-usability-proof')).toEqual(expect.objectContaining({
          ok: true,
        }));
        expect(readiness.checks.find(check => check.name === 'post-seed-verification-plan')).toEqual(expect.objectContaining({
          ok: true,
        }));
        expect(readiness.checks.find(check => check.name === 'post-seed-no-url-dumps')).toEqual(expect.objectContaining({
          ok: true,
        }));
        expect(JSON.stringify(readiness)).not.toContain('https://bbc.com/news');
        expect(readiness.actionPolicy).toEqual(expect.objectContaining({
          dryRunOnly: true,
          seedRemoteCrawlers: false,
          enqueueUrls: false,
          alterCollectBehavior: false,
        }));
      } finally {
        for (const filePath of [previewPath, checklistPath, postSeedPath]) {
          try { fs.unlinkSync(filePath); } catch (_err) { /* ignore */ }
        }
      }
    });
  });

  test('writes bounded approval readiness evidence', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const base = path.join(os.tmpdir(), `graph-feedback-readiness-write-${Date.now()}-${Math.random()}`);
      const previewPath = `${base}-preview.json`;
      const checklistPath = `${base}-approval.json`;
      const readinessPath = `${base}-readiness.json`;
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        const previewEvidence = writeLiveSeedPreviewEvidenceSync(previewPath, plan);
        const approvalChecklist = writeLiveSeedApprovalChecklistSync(checklistPath, plan, {
          previewEvidencePath: previewPath,
          seedAttemptLogPath: `${base}-attempts.jsonl`,
        });
        const readiness = writeLiveSeedApprovalReadinessSync(readinessPath, {
          approvalChecklist,
          approvalChecklistPath: checklistPath,
          previewEvidence,
          previewEvidencePath: previewPath,
        });
        const raw = fs.readFileSync(readinessPath, 'utf8');

        expect(readiness.readyForApproval).toBe(true);
        expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(16 * 1024);
        expect(raw).not.toContain('https://bbc.com/news');
      } finally {
        for (const filePath of [previewPath, checklistPath, readinessPath]) {
          try { fs.unlinkSync(filePath); } catch (_err) { /* ignore */ }
        }
      }
    });
  });

  test('marks approval readiness false for preview fingerprint mismatches', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const previewEvidence = {
        ...plan.previewEvidence,
        fingerprint: '0'.repeat(64),
      };
      const checklist = buildLiveSeedApprovalChecklist(plan, {
        previewEvidencePath: 'tmp/preview.json',
        seedAttemptLogPath: 'tmp/attempts.jsonl',
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      const readiness = buildLiveSeedApprovalReadiness({
        approvalChecklist: checklist,
        previewEvidence,
        generatedAt: '2026-05-26T12:06:00.000Z',
      });

      expect(readiness.readyForApproval).toBe(false);
      expect(readiness.summary.blockers).toContain('preview-evidence-match');
      expect(readiness.checks.find(check => check.name === 'preview-evidence-match')).toEqual(expect.objectContaining({
        ok: false,
      }));
    });
  });

  test('marks approval readiness false when remote usability proof is missing', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const previewEvidence = plan.previewEvidence;
      const checklist = buildLiveSeedApprovalChecklist(plan, {
        previewEvidencePath: 'tmp/preview.json',
        seedAttemptLogPath: 'tmp/attempts.jsonl',
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      delete checklist.remoteUsabilityProof;

      const readiness = buildLiveSeedApprovalReadiness({
        approvalChecklist: checklist,
        previewEvidence,
        generatedAt: '2026-05-26T12:06:00.000Z',
      });

      expect(readiness.readyForApproval).toBe(false);
      expect(readiness.summary.blockers).toEqual(expect.arrayContaining([
        'remote-usability-proof',
        'remote-usability-no-action',
      ]));
      expect(readiness.remoteUsability).toEqual(expect.objectContaining({
        present: false,
        commandNames: [],
      }));
    });
  });

  test('builds pre-seed remote usability proof commands without contacting remote', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const proof = buildPreSeedRemoteUsabilityProof(plan);

      expect(proof.mode).toBe('graph-feedback-live-seed-pre-seed-remote-usability');
      expect(proof.commands.map(command => command.name)).toEqual([
        'health',
        'status-build',
        'recent-errors',
        'content-probe',
        'deploy-preflight',
      ]);
      expect(proof.commands.find(command => command.name === 'content-probe').command)
        .toContain('crawl-remote.js content --domain bbc.com --json');
      expect(proof.commands.find(command => command.name === 'deploy-preflight').command)
        .toContain('deploy-remote-server.js --preflight-only --json');
      expect(proof.actionPolicy).toEqual(expect.objectContaining({
        checklistOnly: true,
        seedRemoteCrawlers: false,
        enqueueUrls: false,
        alterCollectBehavior: false,
      }));
    });
  });

  test('builds post-seed verification commands and evidence shape without contacting remote', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const verification = buildPostSeedVerificationChecklist(plan, {
        approvalChecklistPath: 'tmp/approval.json',
      });

      expect(verification.mode).toBe('graph-feedback-live-seed-post-seed-verification');
      expect(verification.evidenceArtifact.maxBytes).toBe(16 * 1024);
      expect(verification.evidenceArtifact.shape.checks.map(check => check.name)).toEqual([
        'health',
        'status',
        'errors',
        'content',
        'sync-or-pull',
        'local-db-confirmation',
      ]);
      expect(verification.evidenceArtifact.shape.mode).toBe('graph-feedback-live-seed-post-seed-verification-evidence');
      expect(verification.evidenceArtifact.shape.rollback).toEqual({
        attempted: '<boolean>',
        ok: '<boolean>',
        summary: '<bounded text>',
      });
      expect(verification.rollbackCommands[0].command).toContain('crawl-remote.js stop --domains bbc.com');
    });
  });

  test('builds compact post-seed verification evidence with URL redaction', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const evidence = buildPostSeedVerificationEvidence(plan, {
        generatedAt: '2026-05-26T12:05:00.000Z',
        approvalChecklistPath: 'tmp/approval.json',
        seedAttemptLogPath: 'tmp/attempts.jsonl',
        checks: [
          { name: 'health', ok: true, summary: 'healthy at https://bbc.com/news' },
          { name: 'status', ok: false, summary: 'pending queue needs review' },
        ],
        rollbackStatus: {
          attempted: true,
          ok: true,
          summary: 'stopped https://bbc.com/news seed host',
        },
      });
      const raw = JSON.stringify(evidence);

      expect(evidence.mode).toBe('graph-feedback-live-seed-post-seed-verification-evidence');
      expect(evidence.previewFingerprint).toBe(plan.previewEvidence.fingerprint);
      expect(evidence.allChecksOk).toBe(false);
      expect(evidence.checks).toEqual([
        { name: 'health', ok: true, summary: 'healthy at [redacted:url]' },
        { name: 'status', ok: false, summary: 'pending queue needs review' },
      ]);
      expect(evidence.rollback.summary).toBe('stopped [redacted:url] seed host');
      expect(raw).not.toContain('https://bbc.com/news');
      expect(evidence.actionPolicy).toEqual(expect.objectContaining({
        evidenceOnly: true,
        seedRemoteCrawlers: false,
        enqueueUrls: false,
        alterCollectBehavior: false,
      }));
    });
  });

  test('writes bounded post-seed verification evidence', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const evidencePath = path.join(os.tmpdir(), `graph-feedback-post-seed-${Date.now()}-${Math.random()}.json`);
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        const evidence = writePostSeedVerificationEvidenceSync(evidencePath, plan, {
          seedAttemptLogPath: 'tmp/attempts.jsonl',
          checks: [
            { name: 'health', ok: true, summary: 'ok' },
            { name: 'status', ok: true, summary: 'idle after seed' },
          ],
        });
        const raw = fs.readFileSync(evidencePath, 'utf8');
        expect(evidence.mode).toBe('graph-feedback-live-seed-post-seed-verification-evidence');
        expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(16 * 1024);
      } finally {
        try { fs.unlinkSync(evidencePath); } catch (_err) { /* ignore */ }
      }
    });
  });

  test('writes bounded post-seed verification checklist without contacting remote', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const checklistPath = path.join(os.tmpdir(), `graph-feedback-post-seed-checklist-${Date.now()}-${Math.random()}.json`);
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      try {
        const checklist = writePostSeedVerificationChecklistSync(checklistPath, plan, {
          approvalChecklistPath: 'tmp/approval.json',
        });
        const raw = fs.readFileSync(checklistPath, 'utf8');

        expect(checklist.mode).toBe('graph-feedback-live-seed-post-seed-verification');
        expect(checklist.commands.map(command => command.name)).toEqual(expect.arrayContaining([
          'health',
          'status',
          'errors',
          'content',
          'one-round-sync',
          'local-db-recent',
        ]));
        expect(checklist.rollbackCommands.map(command => command.name)).toEqual([
          'stop-target-hosts',
          'status-after-stop',
        ]);
        expect(checklist.evidenceArtifact.shape.mode).toBe('graph-feedback-live-seed-post-seed-verification-evidence');
        expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(16 * 1024);
        expect(raw).not.toContain('https://bbc.com/news');
      } finally {
        try { fs.unlinkSync(checklistPath); } catch (_err) { /* ignore */ }
      }
    });
  });

  test('rejects oversized post-seed verification evidence shapes', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      const plan = buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      });
      const checks = Array.from({ length: 13 }, (_, index) => ({
        name: `check-${index}`,
        ok: true,
        summary: 'ok',
      }));

      expect(() => buildPostSeedVerificationEvidence(plan, { checks }))
        .toThrow('at most 12 check');
    });
  });

  test('rejects missing or invalid freshness evidence for live seeding', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com', { generatedAt: undefined }), (artifactPath) => {
      expect(() => buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      })).toThrow('requires artifact generatedAt freshness evidence');
    });

    withTempArtifact(makeGraphFeedbackArtifact('bbc.com', { generatedAt: 'not-a-date' }), (artifactPath) => {
      expect(() => buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      })).toThrow('requires a valid artifact generatedAt timestamp');
    });

    withTempArtifact(makeGraphFeedbackArtifact('bbc.com', { generatedAt: '2026-05-27T00:00:00.000Z' }), (artifactPath) => {
      expect(() => buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      })).toThrow('rejects artifacts generated in the future');
    });
  });

  test('rejects www-prefixed hosts for first live-seeding slice', () => {
    withTempArtifact(makeGraphFeedbackArtifact('www.bbc.com'), (artifactPath) => {
      expect(() => buildGraphFeedbackLiveSeedPlan(['www.bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      })).toThrow('requires non-www remote domain keys');
    });
  });

  test('rejects live seed URLs that exceed artifact URL length bounds', () => {
    const tooLongUrl = `https://bbc.com/${'x'.repeat(MAX_ARTIFACT_URL_LENGTH)}`;
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com', {
      domainOverrides: {
        recommendations: [{ url: tooLongUrl }],
      },
    }), (artifactPath) => {
      expect(() => buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
      })).toThrow(`exceeds ${MAX_ARTIFACT_URL_LENGTH}`);
    });
  });

  test('rejects live seed URLs with ambiguous command delimiters', () => {
    expect(() => validateLiveSeedUrl('https://bbc.com/news|extra', 'bbc.com'))
      .toThrow('unsupported command delimiters');
  });

  test('rejects seed request bodies above the live cap', () => {
    withTempArtifact(makeGraphFeedbackArtifact('bbc.com'), (artifactPath) => {
      expect(() => buildGraphFeedbackLiveSeedPlan(['bbc.com'], artifactPath, {
        generatedAt: '2026-05-26T12:00:00.000Z',
        caps: { maxRequestBodyBytes: 10 },
      })).toThrow('seed request body is');
    });
  });
});
