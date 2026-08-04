const SkeletonDiff = require('../SkeletonDiff');
const cheerio = require('cheerio');

describe('SkeletonDiff.generateMask', () => {
    it('identifies differing text content as dynamic paths', () => {
        const htmlA = '<div><p class="hero">Hello</p><p>World</p></div>';
        const htmlB = '<div><p class="hero">Hi</p><p>World</p></div>';

        const result = SkeletonDiff.generateMask([cheerio.load(htmlA), cheerio.load(htmlB)]);
        // c193: the leaf <p> is the dynamic node — 0.1.0.0 = html > body >
        // div > first p. The old expectation ('0') pinned the broken
        // subtree-text behavior, which flagged the whole document at the root
        // and skipped descent (hiding structural mismatches — see the
        // now-passing structure-throw test).
        expect(result.dynamicPaths).toEqual(['0.1.0.0']);
    });

    it('normalizes class order when comparing nodes', () => {
        const htmlA = '<div><span class="b a">Same</span></div>';
        const htmlB = '<div><span class="a b">Same</span></div>';

        const result = SkeletonDiff.generateMask([cheerio.load(htmlA), cheerio.load(htmlB)]);
        expect(result.dynamicPaths).toEqual([]);
    });

    it('flags differing structure as an error', () => {
        const htmlA = '<div><span>One</span></div>';
        const htmlB = '<div><span>One</span><span>Two</span></div>';

        expect(() => SkeletonDiff.generateMask([cheerio.load(htmlA), cheerio.load(htmlB)])).toThrow('Structure mismatch');
    });

    it('requires at least two documents', () => {
        expect(() => SkeletonDiff.generateMask([cheerio.load('<div></div>')])).toThrow('at least two');
    });
});
