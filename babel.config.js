'use strict';

/**
 * Minimal babel config for jest ONLY (cycle 193; chip task_3a4fe4e0).
 *
 * package.json has declared `transform: babel-jest` + transformIgnorePatterns
 * exemptions for the jsdom 27 ESM chain (parse5@8, entities) since the jsdom
 * upgrade — but with NO babel config, babel-jest passed the ESM through
 * untransformed and five suites failed on `import` statements ever since
 * (measured clean-HEAD, cycle 176).
 *
 * Scoped by overrides: preset-env fires ONLY for the exempted ESM
 * node_modules — repo code is passed through untouched (no preset), so jest
 * timing and semantics for the 5000-test tree stay as they were.
 */
module.exports = {
  overrides: [
    {
      test: /node_modules[\\/](jsdom|parse5|entities|saxes)[\\/]/,
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]
      ]
    }
  ]
};
