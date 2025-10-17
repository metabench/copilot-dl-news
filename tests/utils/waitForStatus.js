async function waitForStatus(baseUrl, predicate, options = {}) {
  const { timeoutMs = 15000, intervalMs = 250 } = options;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/status`);
      if (res.ok) {
        const json = await res.json();
        if (predicate(json)) return json;
      }
    } catch (e) {
      // ignore transient errors
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('timeout waiting for status');
}

module.exports = { waitForStatus };
