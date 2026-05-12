# crawl-lists/

User-curated URL lists for the easy crawl dispatcher (`npm run crawl`).

Each file in this directory is referenceable as `@<filename-without-extension>`
on the command line. Examples:

```
npm run crawl @uk-papers
npm run crawl @uk-papers --explain
npm run crawl @uk-papers,bbc.com           # mix list + extra URL
```

## File formats

Two formats are supported. The dispatcher autodetects by content.

### Newline-delimited (`.txt`, recommended)

One URL per line. Lines starting with `#` and blank lines are ignored.
Hostnames without a scheme are auto-promoted to `https://`:

```
# UK national papers
bbc.com/news
theguardian.com/uk
ft.com
https://www.thetimes.co.uk/
```

### JSON array (`.json`)

```json
[
  "https://www.bbc.com/news",
  "https://www.theguardian.com/uk"
]
```

## Notes

- Lists are local-only and gitignored except for any committed example.
- File names should match `^[\w.\-]+$` for clean `@name` references.
- The dispatcher dedupes URLs after normalisation.
