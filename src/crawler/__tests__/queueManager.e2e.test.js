'use strict';

const QueueManager = require('../QueueManager');
const { NavigationDiscoveryService } = require('../NavigationDiscoveryService');
const { ContentAcquisitionService } = require('../ContentAcquisitionService');

describe('QueueManager integration', () => {
  const linkExtractor = {
    extract: ($) => {
      const navigation = [];
      const articles = [];
      const all = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        all.push(href);
        if (href.includes('article')) articles.push(href);
        else navigation.push(href);
      });
      return { navigation, articles, all };
    }
  };

  const normalizeUrl = (url) => new URL(url).href;
  const looksLikeArticle = (url) => url.includes('article');

  test('discovery to acquisition pipeline processes hub then article', async () => {
    const navigation = new NavigationDiscoveryService({
      linkExtractor,
      normalizeUrl,
      looksLikeArticle,
      logger: { warn: jest.fn() }
    });

    const articleProcessor = {
      process: jest.fn().mockResolvedValue({ stored: true })
    };

    const content = new ContentAcquisitionService({
      articleProcessor,
      logger: { error: jest.fn() }
    });

    const urlEligibilityService = {
      evaluate: ({ url, depth }) => ({
        status: 'allow',
        normalized: url,
        host: new URL(url).host,
        kind: url.includes('article') ? 'article' : 'hub',
        queueKey: url,
        meta: {
          origin: 'planner',
          role: url.includes('article') ? 'article' : 'hub',
          depthBucket: depth >= 3 ? '3+' : String(depth) || '0'
        }
      })
    };

    const qm = new QueueManager({
      urlEligibilityService,
      safeHostFromUrl: (url) => new URL(url).host,
      emitEnhancedQueueEvent: jest.fn(),
      computeEnhancedPriority: ({ depth }) => ({ priority: depth, prioritySource: 'depth' })
    });

    const hubUrl = 'http://news.example.com/home';
    const hubHtml = `
      <html>
        <body>
          <a href="http://news.example.com/section/world">World</a>
          <a href="http://news.example.com/article/1">Top Story</a>
        </body>
      </html>
    `;

    const articleUrl = 'http://news.example.com/article/1';
    const articleHtml = `
      <html>
        <body>
          <article>
            <h1>Top Story</h1>
            <p>Breaking news content.</p>
          </article>
        </body>
      </html>
    `;

    const htmlFor = new Map([
      [hubUrl, hubHtml],
      [articleUrl, articleHtml]
    ]);

    qm.enqueue({ url: hubUrl, depth: 0, type: 'hub' });

    const processed = [];
    const maxIterations = 10;
    let iterations = 0;
    let lastArticleDiscovery = null;

    while (iterations < maxIterations) {
      iterations += 1;
      const result = await qm.pullNext();
      if (!result || !result.item) break;
      const job = result.item;
      const html = htmlFor.get(job.url);
      expect(html).toBeDefined();

      const discovery = navigation.discover({ url: job.url, html, depth: job.depth });

      if (job.type === 'hub') {
        processed.push({ type: 'hub', url: job.url });
        for (const link of discovery.articleLinks) {
          const absolute = new URL(link, job.url).href;
          qm.enqueue({ url: absolute, depth: job.depth + 1, type: 'article' });
        }
      } else {
        processed.push({ type: 'article', url: job.url });
        lastArticleDiscovery = discovery;
        await content.acquire({
          url: job.url,
          html,
          depth: job.depth,
          normalizedUrl: job.url,
          linkSummary: discovery.linkSummary,
          cheerioRoot: discovery.$
        });
      }
    }

    expect(processed).toEqual([
      { type: 'hub', url: hubUrl },
      { type: 'article', url: articleUrl }
    ]);

    expect(articleProcessor.process).toHaveBeenCalledTimes(1);
    const args = articleProcessor.process.mock.calls[0][0];
    expect(args.url).toBe(articleUrl);
    expect(args.linkSummary).toBe(lastArticleDiscovery.linkSummary);
    expect(args.$).toBe(lastArticleDiscovery.$);

    const finalSnapshot = qm.getHeatmapSnapshot();
    expect(finalSnapshot.total).toBe(0);
    expect(await qm.pullNext()).toBeNull();
  });
});
