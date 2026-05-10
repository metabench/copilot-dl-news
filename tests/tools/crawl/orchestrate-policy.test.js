'use strict';

const { decideOrchestration } = require('../../../tools/crawl/lib/orchestrate-policy');

describe('decideOrchestration', () => {
  test('chooses remote when remoteAvailable=true', () => {
    const d = decideOrchestration({
      remoteAvailable: true,
      remoteHost: '141.144.193.218:3200',
      uiUrl: 'http://localhost:3170/?app=cloud-crawl',
    });
    expect(d.mode).toBe('remote');
    expect(d.profile).toBe('remote-news-10x1000');
    expect(d.uiHint).toBe('http://localhost:3170/?app=cloud-crawl');
    expect(d.message).toMatch(/Remote crawler healthy/);
  });

  test('falls back to local when remote unavailable and fallback allowed', () => {
    const d = decideOrchestration({
      remoteAvailable: false,
      remoteHealthError: 'ECONNREFUSED',
      localFallback: 'local-news-10x1000',
    });
    expect(d.mode).toBe('local');
    expect(d.profile).toBe('local-news-10x1000');
    expect(d.message).toMatch(/falling back/);
    expect(d.message).toMatch(/ECONNREFUSED/);
  });

  test('returns fail mode when remote down and fallback disabled', () => {
    const d = decideOrchestration({
      remoteAvailable: false,
      remoteHealthError: 'timeout',
      allowFallback: false,
    });
    expect(d.mode).toBe('fail');
    expect(d.profile).toBeNull();
    expect(d.message).toMatch(/timeout/);
  });

  test('honours custom remote profile name', () => {
    const d = decideOrchestration({
      remoteAvailable: true,
      remoteProfile: 'custom-remote-profile',
    });
    expect(d.profile).toBe('custom-remote-profile');
  });
});
