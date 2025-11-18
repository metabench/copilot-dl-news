async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath(args.db);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(args.limit, 5000) : 1000;
  const title = args.title || "Crawler URL Snapshot";
  const db = openNewsDb(dbPath);
  let rawRows = [];
  let totals = null;
  let homeCards = [];
  try {
    rawRows = selectInitialUrls(db.db, { limit });
    totals = buildUrlTotals(db.db);
    homeCards = buildCliHomeCards(db.db, totals);
  } finally {
    try {
      db.close();
    } catch (_) {}
  }

  const columns = buildColumns();
  const rows = buildDisplayRows(rawRows);
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const meta = {
    rowCount: rows.length,
    limit,
    dbLabel: relativeDb,
    generatedAt: formatDateTime(new Date(), true),
    subtitle: `First ${rows.length} URLs from ${relativeDb}`
  };

  const html = renderHtml({ columns, rows, meta, title }, { homeCards });

  if (args.output) {
    const target = path.isAbsolute(args.output) ? args.output : path.resolve(process.cwd(), args.output);
    fs.writeFileSync(target, html, "utf8");
    console.error(`Saved HTML table to ${target}`);
  } else {
    process.stdout.write(html);
  }
}
