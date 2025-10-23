// Heuristic to determine whether a website is a news site.
// Inputs are simple metrics so this can be reused across tools and UI.

/**
 * Score whether a domain looks like a news website.
 * @param {Object} m
 * @param {number} m.articleFetches - Count of fetch rows classified as 'article' for the domain.
 * @param {number} m.distinctSections - Distinct article sections observed for the domain.
 * @param {number} m.datedUrlRatio - Ratio of article URLs containing /YYYY/MM/DD/ style date paths (0..1).
 * @returns {{isNews:boolean, score:number, kind:string, evidence:object}}
 */
function scoreNewsDomain(m) {
  const articles = Math.max(0, Number(m.articleFetches || 0));
  const sections = Math.max(0, Number(m.distinctSections || 0));
  const datedRatio = Math.max(0, Math.min(1, Number(m.datedUrlRatio || 0)));

  // Weighted scoring: articles (0.5), sections (0.2), dated URL ratio (0.3)
  const aScore = Math.min(0.5, articles / 100); // 100 article fetches => full 0.5
  const sScore = Math.min(0.2, sections / 25);  // 25 sections => full 0.2
  const dScore = Math.min(0.3, datedRatio * 0.3 / 0.3); // direct cap to 0.3
  const score = aScore + sScore + dScore;
  const isNews = score >= 0.4; // threshold can be tuned

  return {
    isNews,
    score,
    kind: isNews ? 'news' : 'unknown',
    evidence: {
      articleFetches: articles,
      distinctSections: sections,
      datedUrlRatio: datedRatio
    }
  };
}

/**
 * Compute metrics from the database for a given host and apply the heuristic.
 * @param {import('./db')} db - NewsDatabase instance
 * @param {string} host - e.g., 'theguardian.com'
 * @returns {{analysis: {kind:string, score:number, evidence:object, updatedAt:string}, metrics: object}}
 */
function evaluateDomainFromDb(db, host) {
  let metrics = null;
  if (db && typeof db.getDomainArticleMetrics === 'function') {
    metrics = db.getDomainArticleMetrics(host);
  }

  if (!metrics) {
    metrics = { articleFetches: 0, distinctSections: 0, datedUrlRatio: 0 };
  }

  const res = scoreNewsDomain(metrics);
  return {
    analysis: { kind: res.kind, score: res.score, evidence: res.evidence, updatedAt: new Date().toISOString() },
    metrics
  };
}

module.exports = { scoreNewsDomain, evaluateDomainFromDb };
