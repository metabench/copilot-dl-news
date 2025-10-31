/**
 * Mixed Response Fixtures for Hub Guessing Tests
 * 
 * Provides realistic response scenarios for testing place hub discovery:
 * - Success responses with valid hub content
 * - 404 responses for non-existent hubs
 * - Rate limit responses (429)
 * - Server error responses (500, 503)
 * - Redirect responses (301, 302)
 * - Network timeout scenarios
 */

'use strict';

/**
 * Creates a realistic hub HTML page with article links
 * @param {string} title - Page title
 * @param {number} articleCount - Number of article links to generate
 * @returns {string} HTML content
 */
function createHubHtml(title, articleCount = 25) {
  const articles = Array.from({ length: articleCount }, (_, index) => {
    return `<a href="/article-${index + 1}" class="article-link">
      <h3>Breaking News Story ${index + 1}</h3>
      <p>Latest updates from ${title.replace(' Hub', '')} region...</p>
    </a>`;
  }).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="Latest news from ${title.replace(' Hub', '')}">
</head>
<body>
  <header>
    <h1>${title}</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/world">World</a>
      <a href="/politics">Politics</a>
    </nav>
  </header>
  <main>
    <section class="articles">
      ${articles}
    </section>
  </main>
</body>
</html>`;
}

/**
 * Creates a 404 error page
 * @param {string} url - The requested URL
 * @returns {string} HTML content
 */
function create404Html(url) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Page Not Found</title>
</head>
<body>
  <h1>404 - Page Not Found</h1>
  <p>The page you requested (${url}) could not be found.</p>
  <p><a href="/">Return to homepage</a></p>
</body>
</html>`;
}

/**
 * Creates a rate limit error page
 * @returns {string} HTML content
 */
function createRateLimitHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Rate Limit Exceeded</title>
</head>
<body>
  <h1>429 - Too Many Requests</h1>
  <p>You have exceeded the rate limit. Please try again later.</p>
  <p>Retry after: 60 seconds</p>
</body>
</html>`;
}

/**
 * Creates a server error page
 * @param {number} status - HTTP status code (500, 503, etc.)
 * @returns {string} HTML content
 */
function createServerErrorHtml(status = 500) {
  const messages = {
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  const message = messages[status] || 'Server Error';
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>${status} ${message}</title>
</head>
<body>
  <h1>${status} - ${message}</h1>
  <p>The server encountered an error and could not complete your request.</p>
  <p>Please try again later.</p>
</body>
</html>`;
}

/**
 * Mock response factory
 * @param {Object} options - Response options
 * @param {number} options.status - HTTP status code
 * @param {string} options.body - Response body
 * @param {string} options.url - Response URL
 * @param {Object} options.headers - HTTP headers
 * @returns {Object} Mock response object
 */
function createResponse({ status = 200, body = '', url = 'https://example.com', headers = {} }) {
  const headerMap = new Map();
  for (const [key, value] of Object.entries(headers)) {
    headerMap.set(key.toLowerCase(), value);
  }
  
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) || null;
      }
    },
    async text() {
      return body;
    }
  };
}

/**
 * Predefined response scenarios for testing
 */
const scenarios = {
  // Successful hub discovery
  successfulCountryHub: {
    url: 'https://newssite.com/world/france',
    response: createResponse({
      status: 200,
      body: createHubHtml('France Hub', 30),
      url: 'https://newssite.com/world/france',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  },
  
  successfulRegionHub: {
    url: 'https://newssite.com/california',
    response: createResponse({
      status: 200,
      body: createHubHtml('California Hub', 25),
      url: 'https://newssite.com/california',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  },
  
  successfulCityHub: {
    url: 'https://newssite.com/london',
    response: createResponse({
      status: 200,
      body: createHubHtml('London Hub', 20),
      url: 'https://newssite.com/london',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  },
  
  // 404 responses
  notFoundCountryHub: {
    url: 'https://newssite.com/world/atlantis',
    response: createResponse({
      status: 404,
      body: create404Html('/world/atlantis'),
      url: 'https://newssite.com/world/atlantis',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  },
  
  notFoundRegionHub: {
    url: 'https://newssite.com/nonexistent-state',
    response: createResponse({
      status: 404,
      body: create404Html('/nonexistent-state'),
      url: 'https://newssite.com/nonexistent-state'
    })
  },
  
  // Rate limiting
  rateLimitedRequest: {
    url: 'https://newssite.com/world/germany',
    response: createResponse({
      status: 429,
      body: createRateLimitHtml(),
      url: 'https://newssite.com/world/germany',
      headers: { 
        'content-type': 'text/html; charset=utf-8',
        'retry-after': '60'
      }
    })
  },
  
  // Server errors
  serverError: {
    url: 'https://newssite.com/world/italy',
    response: createResponse({
      status: 500,
      body: createServerErrorHtml(500),
      url: 'https://newssite.com/world/italy',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  },
  
  serviceUnavailable: {
    url: 'https://newssite.com/world/spain',
    response: createResponse({
      status: 503,
      body: createServerErrorHtml(503),
      url: 'https://newssite.com/world/spain',
      headers: { 
        'content-type': 'text/html; charset=utf-8',
        'retry-after': '120'
      }
    })
  },
  
  // Redirects
  permanentRedirect: {
    url: 'https://newssite.com/uk',
    response: createResponse({
      status: 301,
      body: '',
      url: 'https://newssite.com/world/united-kingdom',
      headers: { 
        'location': 'https://newssite.com/world/united-kingdom'
      }
    })
  },
  
  temporaryRedirect: {
    url: 'https://newssite.com/usa',
    response: createResponse({
      status: 302,
      body: '',
      url: 'https://newssite.com/world/united-states',
      headers: { 
        'location': 'https://newssite.com/world/united-states'
      }
    })
  }
};

/**
 * Creates a mock fetch function that returns predefined responses
 * @param {Object} responseMap - Map of URLs to responses
 * @param {Object} defaultResponse - Default response for unmapped URLs
 * @returns {Function} Mock fetch function
 */
function createMockFetch(responseMap = {}, defaultResponse = null) {
  return jest.fn((url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    
    // Handle HEAD requests by returning same response with empty body
    if (method === 'HEAD' && responseMap[url]) {
      const original = responseMap[url];
      return Promise.resolve(createResponse({
        status: original.status,
        body: '',
        url: original.url,
        headers: original.headers.get ? 
          Object.fromEntries([...Array(10)].map((_, i) => [`header-${i}`, null]).filter(([k]) => original.headers.get(k))) :
          original.headers
      }));
    }
    
    if (responseMap[url]) {
      return Promise.resolve(responseMap[url]);
    }
    
    if (defaultResponse) {
      return Promise.resolve(defaultResponse);
    }
    
    // Default 404 for unmapped URLs
    return Promise.resolve(createResponse({
      status: 404,
      body: create404Html(url),
      url
    }));
  });
}

/**
 * Creates a batch of mixed responses for testing multi-domain scenarios
 * @param {string[]} domains - List of domains to create responses for
 * @returns {Object} Map of URLs to responses
 */
function createMixedBatchResponses(domains) {
  const responses = {};
  const responseTypes = [
    'success',
    'success', 
    'notFound',
    'rateLimit',
    'serverError'
  ];
  
  domains.forEach((domain, index) => {
    const responseType = responseTypes[index % responseTypes.length];
    const countryUrl = `https://${domain}/world/testcountry-${index}`;
    
    switch (responseType) {
      case 'success':
        responses[countryUrl] = createResponse({
          status: 200,
          body: createHubHtml(`Test Country ${index} Hub`, 15 + index),
          url: countryUrl
        });
        break;
      case 'notFound':
        responses[countryUrl] = createResponse({
          status: 404,
          body: create404Html(countryUrl),
          url: countryUrl
        });
        break;
      case 'rateLimit':
        responses[countryUrl] = createResponse({
          status: 429,
          body: createRateLimitHtml(),
          url: countryUrl,
          headers: { 'retry-after': '30' }
        });
        break;
      case 'serverError':
        responses[countryUrl] = createResponse({
          status: 500,
          body: createServerErrorHtml(500),
          url: countryUrl
        });
        break;
    }
  });
  
  return responses;
}

module.exports = {
  // Factory functions
  createHubHtml,
  create404Html,
  createRateLimitHtml,
  createServerErrorHtml,
  createResponse,
  createMockFetch,
  createMixedBatchResponses,
  
  // Predefined scenarios
  scenarios
};