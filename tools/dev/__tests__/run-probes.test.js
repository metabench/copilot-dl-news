'use strict';

const { classifyResult, summarize } = require('../run-probes');

describe('run-probes classifyResult (the skip/fail policy)', () => {
  test('server-dependent probe is SKIPPED (not failed) when the server is down', () => {
    expect(classifyResult({ needsServer: true, serverUp: false, ran: false }).status).toBe('skipped');
  });

  test('server-dependent probe runs and passes when server is up and exit matches', () => {
    expect(classifyResult({ needsServer: true, serverUp: true, ran: true, exitCode: 0 }).status).toBe('pass');
  });

  test('default expected exit is 0', () => {
    expect(classifyResult({ ran: true, exitCode: 0 }).status).toBe('pass');
    expect(classifyResult({ ran: true, exitCode: 1 }).status).toBe('fail');
  });

  test('a non-zero expectExit passes ONLY on that code (the timed-probe guard, expect 3)', () => {
    expect(classifyResult({ ran: true, exitCode: 3, expectExit: 3 }).status).toBe('pass');
    expect(classifyResult({ ran: true, exitCode: 0, expectExit: 3 }).status).toBe('fail'); // guard silently not firing = a real regression
    expect(classifyResult({ ran: true, exitCode: 3, expectExit: 3 }).reason).toBe('exit 3');
  });

  test('a timeout is a failure, not a skip', () => {
    const r = classifyResult({ ran: true, timedOut: true, exitCode: null });
    expect(r.status).toBe('fail');
    expect(r.reason).toBe('timed out');
  });

  test('server-INDEPENDENT probes run even when the server is down', () => {
    expect(classifyResult({ needsServer: false, serverUp: false, ran: true, exitCode: 0 }).status).toBe('pass');
  });

  test('summarize: ok iff zero failures; skips do not fail the run', () => {
    const results = [
      { status: 'pass' }, { status: 'pass' }, { status: 'skipped' }
    ];
    expect(summarize(results)).toEqual({ pass: 2, fail: 0, skipped: 1, total: 3, ok: true });

    const withFail = [{ status: 'pass' }, { status: 'fail' }, { status: 'skipped' }];
    const s = summarize(withFail);
    expect(s.ok).toBe(false);
    expect(s.fail).toBe(1);
  });
});
