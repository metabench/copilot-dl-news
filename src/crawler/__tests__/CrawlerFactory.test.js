jest.mock('../NewsCrawler', () => {
  const FakeCrawler = jest.fn(function FakeCrawler(startUrl, options) {
    this.startUrl = startUrl;
    this.options = options;
    this._resolvedOptions = {};
  });
  FakeCrawler._wireCrawlerServices = jest.fn();
  return FakeCrawler;
});

const { CrawlerFactory } = require('../CrawlerFactory');
const NewsCrawler = require('../NewsCrawler');

describe('CrawlerFactory.create', () => {
  beforeEach(() => {
    NewsCrawler.mockClear();
    NewsCrawler._wireCrawlerServices.mockClear();
  });

  test('instantiates NewsCrawler in skip-wiring mode and wires services', () => {
    const crawler = CrawlerFactory.create({
      startUrl: 'https://example.com',
      enableDb: false
    });

    expect(NewsCrawler).toHaveBeenCalledTimes(1);
    expect(NewsCrawler).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      _skipWiring: true,
      enableDb: false
    }));
    expect(NewsCrawler._wireCrawlerServices).toHaveBeenCalledWith(
      crawler,
      expect.objectContaining({ rawOptions: expect.objectContaining({ startUrl: 'https://example.com' }) })
    );
  });

  test('requires a startUrl', () => {
    expect(() => CrawlerFactory.create({})).toThrow('CrawlerFactory.create requires a startUrl string');
  });
});
