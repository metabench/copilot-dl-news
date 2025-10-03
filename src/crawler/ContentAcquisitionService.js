'use strict';

class ContentAcquisitionService {
  constructor({
    articleProcessor,
    logger
  } = {}) {
    if (!articleProcessor || typeof articleProcessor.process !== 'function') {
      throw new Error('ContentAcquisitionService requires an articleProcessor with a process method');
    }

    this.articleProcessor = articleProcessor;
    this.logger = logger || console;
  }

  async acquire({
    url,
    html,
    fetchMeta = null,
    depth = 0,
    normalizedUrl = null,
    referrerUrl = null,
    discoveredAt = null,
    persistArticle = true,
    insertFetchRecord = true,
    insertLinkRecords = true,
    linkSummary = null,
    cheerioRoot = null
  } = {}) {
    if (!url) {
      throw new Error('ContentAcquisitionService.acquire requires a url');
    }
    if (typeof html !== 'string') {
      throw new Error('ContentAcquisitionService.acquire requires html as a string');
    }

    try {
      return await this.articleProcessor.process({
        url,
        html,
        fetchMeta,
        depth,
        normalizedUrl,
        referrerUrl,
        discoveredAt,
        persistArticle,
        insertFetchRecord,
        insertLinkRecords,
        linkSummary,
        $: cheerioRoot
      });
    } catch (error) {
      try {
        this.logger?.error?.('ContentAcquisitionService failed', {
          error: error?.message || String(error),
          url
        });
      } catch (_) {}
      throw error;
    }
  }
}

module.exports = {
  ContentAcquisitionService
};
