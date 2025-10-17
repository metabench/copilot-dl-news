function extractDomain(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch (err) {
    return null;
  }
}

function applyPlaceholdersToSegment(segment, placeholders) {
  let value = segment;
  let replaced = false;
  const tests = [
    ['slug', '{slug}'],
    ['code', '{code}'],
    ['regionCode', '{regionCode}']
  ];

  for (const [key, token] of tests) {
    const source = placeholders[key];
    if (!source) continue;
    const lowerSegment = value.toLowerCase();
    const lowerToken = source.toLowerCase();

    if (lowerSegment === lowerToken) {
      value = token;
      replaced = true;
      continue;
    }

    if (lowerSegment.includes(lowerToken)) {
      const segments = value.split('-');
      let changed = false;
      const nextSegments = segments.map((part) => {
        if (part.toLowerCase() === lowerToken) {
          changed = true;
          return token;
        }
        return part;
      });
      if (changed) {
        value = nextSegments.join('-');
        replaced = true;
      }
    }
  }

  return { value, replaced };
}

function derivePatternFromUrl(url, placeholders = {}) {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    if (segments.length > 6) return null;

    let replacedAny = false;
    const patternSegments = segments.map((segment) => {
      const { value, replaced } = applyPlaceholdersToSegment(segment, placeholders);
      if (replaced) replacedAny = true;
      return value;
    });

    if (!replacedAny) {
      return null;
    }

    return '/' + patternSegments.join('/');
  } catch (err) {
    return null;
  }
}

module.exports = {
  extractDomain,
  derivePatternFromUrl
};
