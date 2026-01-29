const SkeletonDiff = require('../SkeletonDiff');
const cheerio = require('cheerio');

describe('SkeletonDiff.generateMask', () => {
    it('identifies differing text content as dynamic paths', () => {
        const htmlA = '<div><p class="hero">Hello</p><p>World</p></div>';
        const htmlB = '<div><p class="hero">Hi</p><p>World</p></div>';

        const result = SkeletonDiff.generateMask([cheerio.load(htmlA), cheerio.load(htmlB)]);
        expect(result.dynamicPaths).toEqual(['0']);
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
