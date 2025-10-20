/**
 * @jest-environment jsdom
 */

import { createCrawlProgressIntegration } from '../crawlProgressIntegration.js';

function createContainers() {
  document.body.innerHTML = `
    <div id="progress"></div>
    <div id="telemetry"></div>
  `;
  return {
    progressContainer: document.getElementById('progress'),
    telemetryContainer: document.getElementById('telemetry')
  };
}

describe('createCrawlProgressIntegration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('marks progress indicator as success when telemetry completion is detected', () => {
    const { progressContainer, telemetryContainer } = createContainers();
    const integration = createCrawlProgressIntegration({
      progressContainer,
      telemetryContainer
    });

    integration.handleCrawlStart({ jobId: 'job-1', maxPages: 10 });
    integration.handleTelemetry({
      type: 'info',
      message: 'Geography crawl finished successfully',
      jobId: 'job-1'
    });

    const state = integration.progressIndicator.getState();
    expect(state.mainTask.status).toBe('success');
    expect(state.mainTask.stageLabel.toLowerCase()).toContain('finished');

    integration.destroy();
  });

  it('ignores completion telemetry for a different job', () => {
    const { progressContainer, telemetryContainer } = createContainers();
    const integration = createCrawlProgressIntegration({
      progressContainer,
      telemetryContainer
    });

    integration.handleCrawlStart({ jobId: 'job-1', maxPages: 10 });
    integration.handleTelemetry({
      type: 'info',
      message: 'Crawl completed successfully',
      jobId: 'job-2'
    });

    const state = integration.progressIndicator.getState();
    expect(state.mainTask.status).toBe('running');

    integration.destroy();
  });

  it('emits completion metadata through the progress callback', () => {
    const { progressContainer, telemetryContainer } = createContainers();
    const onProgressUpdate = jest.fn();
    const integration = createCrawlProgressIntegration({
      progressContainer,
      telemetryContainer,
      onProgressUpdate
    });

    integration.handleCrawlStart({ jobId: 'job-42', maxPages: 5 });
    integration.handleTelemetry({
      type: 'completed',
      message: 'Job finished',
      jobId: 'job-42'
    });

    expect(onProgressUpdate).toHaveBeenCalledWith(expect.objectContaining({
      type: 'telemetry',
      meta: expect.objectContaining({ completionDetected: true })
    }));

    integration.destroy();
  });
});
