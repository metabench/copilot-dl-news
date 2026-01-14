'use strict';

const { html, head, body, title, meta, link, script, div, h1, h2, p, span, table, thead, tbody, tr, th, td } = require('../../../shared/utils/html');

/**
 * Renders the gazetteer progress page with live updates
 */
function renderGazetteerProgressPage({ progress, counts, navigation }) {
  const { totalStages, completedStages, inProgressStages, currentStage, overallPercent, stages } = progress;

  return html([
    head([
      meta({ charset: 'utf-8' }),
      meta({ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
      title('Gazetteer Progress'),
      link({ rel: 'stylesheet', href: '/assets/crawler.css' })
    ]),
    body([
      navigation,
      div({ class: 'container' }, [
        h1('Gazetteer Crawl Progress'),
        
        // Overall progress
        div({ class: 'progress-overview' }, [
          h2('Overall Progress'),
          div({ class: 'progress-stats' }, [
            div({ class: 'stat' }, [
              span({ class: 'stat-label' }, 'Current Stage:'),
              span({ class: 'stat-value', id: 'current-stage' }, currentStage)
            ]),
            div({ class: 'stat' }, [
              span({ class: 'stat-label' }, 'Stages Complete:'),
              span({ class: 'stat-value', id: 'stages-complete' }, `${completedStages} / ${totalStages}`)
            ]),
            div({ class: 'stat' }, [
              span({ class: 'stat-label' }, 'Total Places:'),
              span({ class: 'stat-value', id: 'total-places' }, counts?.total || 0)
            ])
          ]),
          div({ class: 'progress-bar-container' }, [
            div({ class: 'progress-bar', style: `width: ${overallPercent}%`, id: 'overall-progress' }, 
              span({ class: 'progress-text' }, `${overallPercent}%`)
            )
          ])
        ]),

        // Stage details
        div({ class: 'stages-section' }, [
          h2('Stage Details'),
          table({ class: 'stages-table', id: 'stages-table' }, [
            thead([
              tr([
                th('Stage'),
                th('Status'),
                th('Progress'),
                th('Records Processed'),
                th('Records Upserted'),
                th('Errors'),
                th('Duration')
              ])
            ]),
            tbody(
              stages.map(stage => renderStageRow(stage))
            )
          ])
        ]),

        // Place counts by kind
        div({ class: 'counts-section' }, [
          h2('Place Counts by Type'),
          div({ class: 'counts-grid', id: 'counts-grid' }, 
            counts?.byKind ? Object.entries(counts.byKind).map(([kind, count]) =>
              div({ class: 'count-item' }, [
                span({ class: 'count-label' }, kind),
                span({ class: 'count-value' }, count)
              ])
            ) : [p('No data yet')]
          )
        ])
      ]),

      // Auto-refresh script
      script({ type: 'text/javascript' }, `
        (function() {
          let refreshInterval;
          
          function updateProgress() {
            fetch('/api/gazetteer/progress')
              .then(res => res.json())
              .then(data => {
                // Update overall stats
                document.getElementById('current-stage').textContent = data.currentStage || 'complete';
                document.getElementById('stages-complete').textContent = 
                  (data.completedStages || 0) + ' / ' + (data.totalStages || 0);
                document.getElementById('total-places').textContent = 
                  data.counts?.total || 0;
                
                // Update overall progress bar
                const overallPercent = data.overallPercent || 0;
                const progressBar = document.getElementById('overall-progress');
                progressBar.style.width = overallPercent + '%';
                progressBar.querySelector('.progress-text').textContent = overallPercent + '%';
                
                // Update stage table
                const tbody = document.querySelector('#stages-table tbody');
                if (data.stages && tbody) {
                  tbody.innerHTML = data.stages.map(stage => {
                    const statusClass = stage.status === 'completed' ? 'status-complete' : 
                                       stage.status === 'in_progress' ? 'status-active' :
                                       stage.status === 'failed' ? 'status-failed' : 'status-pending';
                    const duration = stage.startedAt && stage.completedAt ? 
                      formatDuration(stage.completedAt - stage.startedAt) : '-';
                    return \`
                      <tr>
                        <td><strong>\${stage.name}</strong></td>
                        <td><span class="status-badge \${statusClass}">\${stage.status}</span></td>
                        <td>
                          <div class="mini-progress-bar">
                            <div class="mini-progress-fill" style="width: \${stage.progressPercent || 0}%"></div>
                            <span class="mini-progress-text">\${stage.progressPercent || 0}%</span>
                          </div>
                        </td>
                        <td>\${stage.recordsProcessed || 0}</td>
                        <td>\${stage.recordsUpserted || 0}</td>
                        <td>\${stage.errors || 0}</td>
                        <td>\${duration}</td>
                      </tr>
                    \`;
                  }).join('');
                }
                
                // Update counts grid
                const countsGrid = document.getElementById('counts-grid');
                if (data.counts?.byKind && countsGrid) {
                  countsGrid.innerHTML = Object.entries(data.counts.byKind)
                    .map(([kind, count]) => \`
                      <div class="count-item">
                        <span class="count-label">\${kind}</span>
                        <span class="count-value">\${count}</span>
                      </div>
                    \`).join('');
                }
                
                // Stop polling if complete
                if (data.currentStage === 'complete' && refreshInterval) {
                  clearInterval(refreshInterval);
                  refreshInterval = null;
                }
              })
              .catch(err => console.error('Failed to update progress:', err));
          }
          
          function formatDuration(ms) {
            if (!ms) return '-';
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
            if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
            return seconds + 's';
          }
          
          // Start polling every 2 seconds
          refreshInterval = setInterval(updateProgress, 2000);
          updateProgress(); // Initial update
        })();
      `)
    ])
  ]);
}

function renderStageRow(stage) {
  const statusClass = stage.status === 'completed' ? 'status-complete' : 
                     stage.status === 'in_progress' ? 'status-active' :
                     stage.status === 'failed' ? 'status-failed' : 'status-pending';
  
  const duration = stage.startedAt && stage.completedAt ? 
    formatDuration(stage.completedAt - stage.startedAt) : '-';

  return tr([
    td(span({ style: 'font-weight: bold' }, stage.name)),
    td(span({ class: `status-badge ${statusClass}` }, stage.status)),
    td(div({ class: 'mini-progress-bar' }, [
      div({ class: 'mini-progress-fill', style: `width: ${stage.progressPercent || 0}%` }),
      span({ class: 'mini-progress-text' }, `${stage.progressPercent || 0}%`)
    ])),
    td(String(stage.recordsProcessed || 0)),
    td(String(stage.recordsUpserted || 0)),
    td(String(stage.errors || 0)),
    td(duration)
  ]);
}

function formatDuration(ms) {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

module.exports = { renderGazetteerProgressPage };
