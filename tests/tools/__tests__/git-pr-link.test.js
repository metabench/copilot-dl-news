'use strict';

const {
  parseGitHubRepoFromOrigin,
  normalizeBranchName,
  buildCompareUrl
} = require('../../../tools/dev/git-pr-link');

describe('git-pr-link helpers', () => {
  test('normalizeBranchName strips refs + origin prefix', () => {
    expect(normalizeBranchName('origin/main')).toBe('main');
    expect(normalizeBranchName('refs/heads/feature/x')).toBe('feature/x');
    expect(normalizeBranchName('refs/remotes/origin/main')).toBe('main');
  });

  test('parseGitHubRepoFromOrigin supports https origin', () => {
    expect(parseGitHubRepoFromOrigin('https://github.com/acme/widget.git')).toEqual({ owner: 'acme', repo: 'widget' });
    expect(parseGitHubRepoFromOrigin('https://github.com/acme/widget')).toEqual({ owner: 'acme', repo: 'widget' });
  });

  test('parseGitHubRepoFromOrigin supports ssh origin', () => {
    expect(parseGitHubRepoFromOrigin('git@github.com:acme/widget.git')).toEqual({ owner: 'acme', repo: 'widget' });
    expect(parseGitHubRepoFromOrigin('git@github.com:acme/widget')).toEqual({ owner: 'acme', repo: 'widget' });
  });

  test('buildCompareUrl encodes branch names', () => {
    const url = buildCompareUrl({ owner: 'acme', repo: 'widget', base: 'main', head: 'feature/x' });
    expect(url).toBe('https://github.com/acme/widget/compare/main...feature%2Fx?expand=1');
  });
});
