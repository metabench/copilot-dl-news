# Follow Ups – Crawler Improvement Strategies - Deep Research & Lab Proposals

## Immediate (This Week)

- [ ] **Create `layout_masks` table** - Schema ready in design doc, run migration
- [ ] **Update `RELIABLE_CRAWLER_ROADMAP.md`** - Mark SkeletonHash, SkeletonDiff as ✅ complete
- [ ] **Create Experiment 037 directory** - `src/ui/lab/experiments/037-skeleton-hash-integration/`

## Short-Term (Week 1-2)

- [ ] **Wire SkeletonHash into ArticleProcessor** - Compute hash for every article, store in layout_signatures
- [ ] **Create soft failure queue table** - `puppeteer_queue` for ContentValidationService soft failures
- [ ] **Create Experiment 030** - Puppeteer Teacher minimal with browser pool

## Medium-Term (Week 3-4)

- [ ] **Implement domain rate persistence** - Add `domain_rate_config` table
- [ ] **Add confidence scoring to ArticleProcessor** - Extend CrawlPlaybookService confidence to content
- [ ] **Create Experiment 032** - Streaming sitemap parser with sax-js

## Research Gaps to Fill

- [ ] Investigate memory footprint of keeping 3 Puppeteer tabs open
- [ ] Benchmark SkeletonHash computation time for large pages (50KB+ HTML)
- [ ] Test layout_masks approach on sites with heavy JS templating

## Documentation Updates Needed

- [ ] Add "Hybrid Architecture" section to crawler architecture diagram
- [ ] Document SkeletonHash/SkeletonDiff API for future agents
- [ ] Create "Puppeteer Teacher" design spec from strategy doc_
