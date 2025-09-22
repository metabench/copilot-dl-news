const faviconRunning = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🟢</text></svg>`;
const faviconPaused = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🟡</text></svg>`;
const faviconStopped = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔴</text></svg>`;
const faviconDefault = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚫</text></svg>`;

function updateFavicon(status) {
  const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
  link.type = 'image/svg+xml';
  link.rel = 'shortcut icon';
  
  switch (status) {
    case 'running':
      link.href = faviconRunning;
      break;
    case 'paused':
      link.href = faviconPaused;
      break;
    case 'stopped':
      link.href = faviconStopped;
      break;
    default:
      link.href = faviconDefault;
  }
  
  document.getElementsByTagName('head')[0].appendChild(link);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof EventSource !== 'undefined') {
    const source = new EventSource('/events');
    
    source.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      if (data.paused) {
        updateFavicon('paused');
      } else {
        updateFavicon('running');
      }
    });

    source.addEventListener('done', () => {
      updateFavicon('stopped');
    });

    // Set initial state
    fetch('/api/status')
      .then(res => res.json())
      .then(status => {
        if (status.running) {
          if (status.paused) {
            updateFavicon('paused');
          } else {
            updateFavicon('running');
          }
        } else {
          updateFavicon('stopped');
        }
      });
  }
});
