# Follow Ups – Unified App: run crawl + progress

- Manual smoke: start Unified App and open `/?app=crawl-status`, start a small crawl, confirm:
	- a job appears in the table
	- live events increment (SSE/remote observable)
	- pause/resume/stop work for the job

- Consider adding a focused HTTP check (or Puppeteer e2e) for `/crawl-status` that asserts the start form renders.
