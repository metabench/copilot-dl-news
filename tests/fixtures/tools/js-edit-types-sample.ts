export interface ArticleRecord {
  id: number;
  url: string;
  title: string;
  publishedAt: string | null;
}

export type FetchOutcome = 'hit' | 'miss' | 'error';

export type HubSummary = {
  place: string;
  articleCount: number;
  outcomes: FetchOutcome[];
};

export enum CrawlPhase {
  Discovery = 'discovery',
  Download = 'download',
  Analysis = 'analysis'
}

export function summarize(records: ArticleRecord[]): HubSummary {
  return {
    place: 'unknown',
    articleCount: records.length,
    outcomes: []
  };
}
