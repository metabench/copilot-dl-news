const { TargetedAnalysisRunner } = require('../planner/TargetedAnalysisRunner');

describe('TargetedAnalysisRunner', () => {
  const buildRunner = ({ htmlByUrl = {}, fetchBehavior = null } = {}) => {
    const fetchPage = jest.fn(async ({ url }) => {
      if (fetchBehavior) return fetchBehavior(url);
      return {
        source: 'network',
        html: htmlByUrl[url] || ''
      };
    });
    const getCachedArticle = jest.fn(async (url) => ({
      html: htmlByUrl[url] || ''
    }));

    const runner = new TargetedAnalysisRunner({
      fetchPage,
      getCachedArticle,
      baseUrl: 'https://example.com',
      domain: 'example.com',
      maxSamples: 2,
      logger: { log: jest.fn(), warn: jest.fn() }
    });

    return { runner, fetchPage, getCachedArticle };
  };

  const sampleHtml = `<!doctype html>
    <html>
      <body>
        <article>
          <h1>Breaking Story</h1>
          <p>${'Important news about elections and policy. '.repeat(5)}</p>
          <p>${'Citizens react positively to the proposed policy changes. '.repeat(4)}</p>
        </article>
      </body>
    </html>`;

  it('analyses targeted seeds and summarises coverage', async () => {
    const url = 'https://example.com/politics/latest';
    const { runner, fetchPage } = buildRunner({
      htmlByUrl: {
        [url]: sampleHtml
      }
    });

    const result = await runner.run({
      seeds: [url],
      sections: ['politics', 'world'],
      articleHints: []
    });

    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ url }));
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toMatchObject({
      url,
      section: 'politics',
      classification: 'article'
    });
    expect(result.coverage).toMatchObject({
      sampleSize: 1,
      avgWordCount: expect.any(Number),
      sectionsCovered: [{ section: 'politics', count: 1 }],
      expectedSections: 2
    });
    expect(result.topKeywords.map((entry) => entry.phrase)).toEqual(
      expect.arrayContaining(['policy'])
    );
  });

  it('falls back to cache when network returns not-modified', async () => {
    const url = 'https://example.com/world/story';
    const { runner, fetchPage, getCachedArticle } = buildRunner({
      htmlByUrl: {
        [url]: sampleHtml
      },
      fetchBehavior: async () => ({ source: 'not-modified' })
    });

    const result = await runner.run({
      seeds: [url],
      sections: ['world'],
      articleHints: []
    });

    expect(fetchPage).toHaveBeenCalled();
    expect(getCachedArticle).toHaveBeenCalledWith(url);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].classification).toBe('article');
    expect(result.coverage.sectionsCovered[0]).toMatchObject({ section: 'world', count: 1 });
  });

  it('handles missing samples gracefully', async () => {
    const { runner } = buildRunner();
    const result = await runner.run({ seeds: [], sections: ['world'] });
    expect(result.samples).toHaveLength(0);
    expect(result.coverage.sampleSize).toBe(0);
    expect(result.coverage.coveragePct).toBe(0);
  });
});
