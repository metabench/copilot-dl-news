"use strict";

const express = require("express");

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 0,
    pages: 1000
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--host" && argv[i + 1]) {
      args.host = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--port" && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--pages" && argv[i + 1]) {
      args.pages = Math.max(1, Number(argv[i + 1]) || 1000);
      i += 1;
      continue;
    }
  }

  return args;
}

function clampInt(value, { min, max }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.floor(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function pageHtml({ n, total, baseUrl }) {
  const next = n < total ? `/page/${n + 1}` : null;
  const prev = n > 1 ? `/page/${n - 1}` : null;

  const related = [
    n + 7 <= total ? `/page/${n + 7}` : null,
    n + 31 <= total ? `/page/${n + 31}` : null,
    n % 2 === 0 ? "/tag/world" : "/tag/uk-news",
    n % 3 === 0 ? "/tag/politics" : "/tag/business"
  ].filter(Boolean);

  const links = [prev, next, ...related].filter(Boolean);

  const linkHtml = links
    .map((href) => `<li><a href="${href}">${href}</a></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The Guardian — Fixture Article ${n}</title>
  <link rel="canonical" href="${baseUrl}/page/${n}" />
</head>
<body>
  <header>
    <h1>The Guardian — Fixture Article ${n}</h1>
    <p>This is a deterministic, offline fixture page for E2E crawling.</p>
  </header>

  <main>
    <article>
      <h2>Story ${n}</h2>
      <p>Page ${n} of ${total}. This content is intentionally repetitive.</p>
      <p>Keywords: guardian fixture crawl e2e.</p>
    </article>

    <nav>
      <h3>Links</h3>
      <ul>
        ${linkHtml}
      </ul>
    </nav>
  </main>
</body>
</html>`;
}

function main() {
  const { host, port, pages } = parseArgs(process.argv.slice(2));
  const app = express();

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow:\n");
  });

  app.get("/", (req, res) => {
    res.status(200).send(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Guardian Fixture</title></head><body><a href="/page/1">Start</a></body></html>`
    );
  });

  app.get("/tag/:tag", (req, res) => {
    const tag = String(req.params.tag || "tag");
    res.status(200).send(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Tag ${tag}</title></head><body>
        <h1>Tag: ${tag}</h1>
        <a href="/page/1">Top story</a>
        <a href="/page/2">More</a>
      </body></html>`
    );
  });

  app.get("/page/:n", (req, res) => {
    const n = clampInt(req.params.n, { min: 1, max: pages });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.status(200).type("html").send(pageHtml({ n, total: pages, baseUrl }));
  });

  const server = app.listen(port, host, () => {
    console.log(`guardian-like fixture listening ${host}:${server.address().port} pages=${pages}`);
  });

  function shutdown() {
    server.close(() => process.exit(0));
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  main();
}
