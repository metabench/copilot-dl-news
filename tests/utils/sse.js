const { TextDecoder } = require('util');

/**
 * Collect SSE events from /events?logs=1 until timeout or predicate satisfied.
 * Returns { events, buffer, timedOut }
 */
async function collectSseEvents(baseUrl, options = {}) {
  const { timeoutMs = 15000, stopOn } = options;
  return new Promise((resolve, reject) => {
    const events = [];
    let buffer = '';

    const url = new URL('/events?logs=1', baseUrl);

    fetch(url.toString())
      .then(response => {
        if (!response.ok) {
          reject(new Error(`SSE connection failed: ${response.status}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const timeout = setTimeout(() => {
          reader.cancel();
          resolve({ events, buffer, timedOut: true });
        }, timeoutMs);

        let currentEvent = {};

        function processLines(lines) {
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent.type = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              const dataStr = line.substring(5).trim();
              try {
                currentEvent.data = JSON.parse(dataStr);
              } catch {
                currentEvent.data = dataStr;
              }
            } else if (line === '') {
              if (currentEvent.type) events.push({ ...currentEvent });
              currentEvent = {};
            }
          }
        }

        function read() {
          reader.read()
            .then(({ done, value }) => {
              if (done) {
                clearTimeout(timeout);
                resolve({ events, buffer, timedOut: false });
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || '';
              processLines(lines);

              if (stopOn) {
                try {
                  const ok = stopOn(events);
                  if (ok) {
                    clearTimeout(timeout);
                    reader.cancel();
                    resolve({ events, buffer, timedOut: false });
                    return;
                  }
                } catch (e) {
                  // ignore predicate errors
                }
              }

              read();
            })
            .catch(err => {
              clearTimeout(timeout);
              reject(err);
            });
        }

        read();
      })
      .catch(reject);
  });
}

module.exports = { collectSseEvents };
