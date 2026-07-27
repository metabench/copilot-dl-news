'use strict';

const ArticleSignalsService = require('../ArticleSignalsService');

/**
 * task #48: the frontier due-selection needs a STRICTER article test than
 * looksLikeArticle, which matches article-WORDS anywhere in the URL and so labels
 * section hubs (/business/, /sport/, /opinion/) as articles — the exact leak that
 * made crawls yield "Opinion"/"Sport" titles. isArticleShapedUrl looks at URL
 * STRUCTURE. Cases below are real shapes sampled from the live frontier.
 */
describe('ArticleSignalsService.isArticleShapedUrl', () => {
  const isArt = ArticleSignalsService.isArticleShapedUrl;

  it('accepts real articles (long id/hash, story id, date path, hyphenated slug)', () => {
    expect(isArt('https://apnews.com/article/dei-military-website-department-of-defense-02673c3aa354f3191405fc9d7b249ab3')).toBe(true);
    expect(isArt('https://www.thehindu.com/news/national/failure-to-count-dnts-gn-devy/article70607271.ece')).toBe(true);
    expect(isArt('https://www.theguardian.com/world/2025/sep/15/gender-critical-women-have-a-right-to-be-heard')).toBe(true);
    expect(isArt('https://www.aljazeera.com/news/2024/8/9/everything-is-legitimate-israeli-leaders-defend-soldiers')).toBe(true);
  });

  it('rejects the section hubs looksLikeArticle mis-labels as articles', () => {
    // These pass looksLikeArticle (contain "business"/"sport"/"opinion"/"news") but are section INDEXES.
    expect(isArt('https://www.thehindu.com/business/')).toBe(false);
    expect(isArt('https://www.thehindu.com/sport/')).toBe(false);
    expect(isArt('https://www.thehindu.com/opinion/')).toBe(false);
    expect(isArt('https://www.thehindu.com/news/national/')).toBe(false);
    expect(isArt('https://www.theguardian.com/uk')).toBe(false);
    expect(isArt('https://www.theguardian.com/politics/labour')).toBe(false);
  });

  it('rejects topic hubs and shallow/utility paths', () => {
    expect(isArt('https://apnews.com/hub/congress')).toBe(false);
    expect(isArt('https://www.bbc.com/arabic/topics/cezln5n1xgwt')).toBe(false); // 8-hex topic id, not a 12+ hash
    expect(isArt('https://www.thehindu.com/myaccount/')).toBe(false);
    expect(isArt('https://www.aljazeera.com/')).toBe(false);                     // homepage
    expect(isArt('https://apnews.com/video')).toBe(false);
  });

  it('never throws on junk input', () => {
    expect(isArt(null)).toBe(false);
    expect(isArt('')).toBe(false);
    expect(isArt('not a url')).toBe(false);
    expect(isArt(42)).toBe(false);
  });

  // cycle 75 — the harness-measured under/over-selection fixes.
  it('accepts CMS /article(s)/<short-mixed-id> that the strict hex/digit test missed', () => {
    // bbc ids like c0m2rkwm87po are 12 alnum mixed — neither 12-hex nor 6-digit,
    // so the old hasLongId test dropped them. The /articles/ parent segment is
    // the unambiguous signal.
    expect(isArt('https://www.bbc.com/sport/football/articles/c0m2rkwm87po')).toBe(true);
    expect(isArt('https://www.bbc.com/sport/cricket/articles/c2k21jkqp81o')).toBe(true);
  });

  it('accepts deep dated/slugged articles that merely end in a trailing slash', () => {
    // The old `endsWith('/') => false` pre-rejected these before their date/slug
    // signals were checked.
    expect(isArt('https://www.nytimes.com/athletic/7456332/2026/07/19/world-cup-golden-ball-glove-boot-spain/')).toBe(true);
    expect(isArt('https://www.nytimes.com/wirecutter/reviews/tracee-ellis-ross-solo-travel-packing/')).toBe(true);
  });

  it('rejects live-blog block-pagination fragments (?page=with:block — same article, N anchors)', () => {
    const base = 'https://www.theguardian.com/world/live/2026/jul/21/us-iran-war-live-updates-strait-of-hormuz-latest-news';
    expect(isArt(base + '?page=with%3Ablock-6a5fff708f0890a39cdc3e75')).toBe(false);
    expect(isArt(base + '?page=with:block-6a6000798f08990d2f69c00a')).toBe(false);
    // the BASE live-blog URL (no fragment) is still kept as one article
    expect(isArt(base)).toBe(true);
  });

  it('rejects non-text-article content types via the whole-segment veto', () => {
    expect(isArt('https://www.irishtimes.com/video/video/2026/07/21/mayo-fans-still-hold-out-hope-for-sam-after-75-year-wait/')).toBe(false);
    expect(isArt('https://www.aljazeera.com/author/saif_khalid_2011426142856218889')).toBe(false);
    expect(isArt('https://www.france24.com/fr/tag/live-coupe-du-monde/')).toBe(false);
    expect(isArt('https://www.irishtimes.com/podcasts/inside-business/no-profit-and-crap-governance-worth-175-trillion/')).toBe(false);
    // topics hub stays rejected (already was, now also via veto)
    expect(isArt('https://www.bbc.com/arabic/topics/cezln5n1xgwt')).toBe(false);
  });

  it('does NOT veto an article whose SLUG merely contains a content-type word', () => {
    // whole-segment match only — "video-game-review" is one slug segment, not `/video/`
    expect(isArt('https://www.theguardian.com/games/2025/sep/15/best-video-game-review-of-the-year')).toBe(true);
  });

  // cycle 75 (adversarial hardening) — multi-word HUB/index landings must NOT be
  // admitted just because their topic slug has 4+ hyphens. The single-word control
  // was already rejected; only the multi-word name used to slip through.
  it('rejects multi-word section/category/hub/series index landings (adversarial)', () => {
    expect(isArt('https://apnews.com/hub/us-department-of-education')).toBe(false);
    expect(isArt('https://www.aljazeera.com/en/category/wars-and-human-rights/')).toBe(false);
    expect(isArt('https://www.theguardian.com/world/series/the-global-dating-crisis')).toBe(false);
    expect(isArt('https://www.npr.org/series/1134840606/fifa-world-cup-2022')).toBe(false);
    expect(isArt('https://www.aljazeera.com/author/saif_khalid_2011426142856218889')).toBe(false);
  });

  // cycle 75 (adversarial hardening) — a genuine text article filed UNDER a hub
  // container must still be kept when its terminal carries a CMS-article signal.
  it('keeps a real text article filed under a hub container (article<id>.ece)', () => {
    expect(isArt('https://www.thehindu.com/newsletter/parliament-watch/protests-postpone-pm-modis-speech/article70594383.ece')).toBe(true);
    // but a media container is unconditional: a /podcast/ .ece is audio, dropped
    expect(isArt('https://www.thehindu.com/podcast/parley/article12345678.ece')).toBe(false);
  });
});
