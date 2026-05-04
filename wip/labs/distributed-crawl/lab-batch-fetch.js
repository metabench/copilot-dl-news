const http = require('http');
const { createWorkerServer } = require('./worker-server');

async function main() {
  const targetPort = 18080;
  const workerPort = 18081;

  const target = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
      return;
    }
    if (req.url === '/head') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise((resolve) => target.listen(targetPort, '127.0.0.1', resolve));

  const worker = createWorkerServer({ port: workerPort, host: '127.0.0.1', maxConcurrency: 5 });

  const payload = {
    maxConcurrency: 5,
    timeoutMs: 5000,
    batchSize: 20,
    requests: [
      { url: `http://127.0.0.1:${targetPort}/ok`, method: 'GET', includeBody: true },
      { url: `http://127.0.0.1:${targetPort}/head`, method: 'HEAD' },
      { url: `http://127.0.0.1:${targetPort}/missing`, method: 'HEAD' },
      // Puppeteer sample (will use GET via page.goto)
      { url: `http://127.0.0.1:${targetPort}/ok`, usePuppeteer: true, includeBody: true },
    ],
  };

  const resp = await fetch(`http://127.0.0.1:${workerPort}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await resp.json();
  console.log(JSON.stringify(json, null, 2));

  await new Promise((resolve) => worker.close(resolve));
  await new Promise((resolve) => target.close(resolve));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
