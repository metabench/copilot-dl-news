"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/facts/FactBase.js
  var require_FactBase = __commonJS({
    "src/facts/FactBase.js"(exports, module) {
      "use strict";
      var FactBase = class _FactBase {
        /**
         * @param {Object} options - Fact configuration
         * @param {string} options.name - Unique fact identifier (e.g., 'url.hasDateSegment')
         * @param {string} options.description - Human-readable description
         * @param {string} options.category - Category: 'url', 'document', 'schema', 'meta', 'response', 'page'
         * @param {string[]} [options.requires] - Input requirements: ['url'], ['url', 'html'], etc.
         * @param {number} [options.version=1] - Fact version for schema evolution
         */
        constructor(options = {}) {
          if (new.target === _FactBase) {
            throw new Error("FactBase is abstract and cannot be instantiated directly");
          }
          const { name, description, category, requires = ["url"], version = 1 } = options;
          if (!name) throw new Error("Fact must have a name");
          if (!description) throw new Error("Fact must have a description");
          if (!category) throw new Error("Fact must have a category");
          this.name = name;
          this.description = description;
          this.category = category;
          this.requires = requires;
          this.version = version;
        }
        /**
         * Extract the fact from input data
         * 
         * @abstract
         * @param {Object} input - Input data (varies by fact type)
         * @returns {FactResult} The extracted fact
         */
        extract(input) {
          throw new Error("Subclasses must implement extract()");
        }
        /**
         * Create a standardized fact result
         * 
         * @protected
         * @param {boolean} value - TRUE if the fact holds, FALSE otherwise
         * @param {Object} [evidence] - Supporting evidence/metadata
         * @returns {FactResult}
         */
        createFact(value, evidence = {}) {
          return {
            name: this.name,
            value: Boolean(value),
            evidence,
            extractedAt: (/* @__PURE__ */ new Date()).toISOString(),
            version: this.version
          };
        }
        /**
         * Get metadata about this fact for registration
         * 
         * @returns {FactMetadata}
         */
        getMetadata() {
          return {
            name: this.name,
            description: this.description,
            category: this.category,
            requires: this.requires,
            version: this.version
          };
        }
        /**
         * Check if this fact can be extracted from the available input
         * 
         * @param {Object} availableData - Object with keys indicating available data types
         * @returns {boolean}
         */
        canExtract(availableData) {
          return this.requires.every((req) => availableData[req] !== void 0);
        }
      };
      module.exports = { FactBase };
    }
  });

  // src/facts/url/UrlFact.js
  var require_UrlFact = __commonJS({
    "src/facts/url/UrlFact.js"(exports, module) {
      "use strict";
      var { FactBase } = require_FactBase();
      var UrlFact = class extends FactBase {
        /**
         * @param {Object} options - Fact configuration
         * @param {string} options.name - Unique fact identifier (should start with 'url.')
         * @param {string} options.description - Human-readable description
         */
        constructor(options = {}) {
          super({
            ...options,
            category: "url",
            requires: ["url"]
          });
        }
        /**
         * Parse and normalize a URL string
         * 
         * @protected
         * @param {string|URL|Object} input - URL string, URL object, or {url: string}
         * @returns {URL} Parsed URL object
         */
        parseUrl(input) {
          if (input instanceof URL) {
            return input;
          }
          const urlString = typeof input === "string" ? input : input == null ? void 0 : input.url;
          if (!urlString) {
            throw new Error("URL input is required");
          }
          try {
            return new URL(urlString);
          } catch (e) {
            throw new Error(`Invalid URL: ${urlString}`);
          }
        }
        /**
         * Get normalized path segments (non-empty)
         * 
         * @protected
         * @param {URL} url - Parsed URL
         * @returns {string[]} Path segments
         */
        getPathSegments(url) {
          return url.pathname.split("/").filter((segment) => segment.length > 0);
        }
        /**
         * Check if path matches a regex pattern
         * 
         * @protected
         * @param {URL} url - Parsed URL
         * @param {RegExp} pattern - Pattern to match
         * @returns {RegExpMatchArray|null} Match result
         */
        matchPath(url, pattern) {
          return url.pathname.match(pattern);
        }
        /**
         * Check if any segment matches a pattern
         * 
         * @protected
         * @param {URL} url - Parsed URL
         * @param {RegExp} pattern - Pattern to match against each segment
         * @returns {string|null} First matching segment or null
         */
        findMatchingSegment(url, pattern) {
          return this.getPathSegments(url).find((seg) => pattern.test(seg)) || null;
        }
        /**
         * Get the file extension from URL path
         * 
         * @protected
         * @param {URL} url - Parsed URL
         * @returns {string|null} Extension without dot (e.g., 'html') or null
         */
        getExtension(url) {
          const match = url.pathname.match(/\.([a-z0-9]+)$/i);
          return match ? match[1].toLowerCase() : null;
        }
        /**
         * Get the last path segment (often the slug)
         * 
         * @protected
         * @param {URL} url - Parsed URL
         * @returns {string|null} Last segment or null if path is /
         */
        getLastSegment(url) {
          const segments = this.getPathSegments(url);
          return segments.length > 0 ? segments[segments.length - 1] : null;
        }
      };
      module.exports = { UrlFact };
    }
  });

  // src/facts/url/HasDateSegment.js
  var require_HasDateSegment = __commonJS({
    "src/facts/url/HasDateSegment.js"(exports, module) {
      "use strict";
      var { UrlFact } = require_UrlFact();
      var HasDateSegment = class extends UrlFact {
        constructor() {
          super({
            name: "url.hasDateSegment",
            description: "URL path contains a recognizable date pattern"
          });
          this.monthNames = {
            jan: "01",
            january: "01",
            feb: "02",
            february: "02",
            mar: "03",
            march: "03",
            apr: "04",
            april: "04",
            may: "05",
            jun: "06",
            june: "06",
            jul: "07",
            july: "07",
            aug: "08",
            august: "08",
            sep: "09",
            sept: "09",
            september: "09",
            oct: "10",
            october: "10",
            nov: "11",
            november: "11",
            dec: "12",
            december: "12"
          };
          this.patterns = [
            // /2024/01/15/ - most specific, slash-separated YYYY/MM/DD
            {
              regex: /\/(\d{4})\/(\d{2})\/(\d{2})\//,
              extract: (m) => ({ year: m[1], month: m[2], day: m[3], format: "YYYY/MM/DD" })
            },
            // /2024/jan/15/ - month name variant (The Guardian, etc.)
            {
              regex: /\/(\d{4})\/([a-z]{3,9})\/(\d{2})\//i,
              extract: (m, self) => {
                const monthNum = self.monthNames[m[2].toLowerCase()];
                return monthNum ? { year: m[1], month: monthNum, day: m[3], format: "YYYY/mon/DD", monthName: m[2].toLowerCase() } : null;
              }
            },
            // /2024-01-15/ or /2024-01-15 - hyphenated
            {
              regex: /\/(\d{4})-(\d{2})-(\d{2})(?:\/|$)/,
              extract: (m) => ({ year: m[1], month: m[2], day: m[3], format: "YYYY-MM-DD" })
            },
            // /20240115/ - compact 8-digit
            {
              regex: /\/(\d{4})(\d{2})(\d{2})(?:\/|$)/,
              extract: (m) => ({ year: m[1], month: m[2], day: m[3], format: "YYYYMMDD" })
            },
            // /2024/01/ - year/month only (less specific, still useful)
            {
              regex: /\/(\d{4})\/(\d{2})\//,
              extract: (m) => ({ year: m[1], month: m[2], day: null, format: "YYYY/MM" })
            },
            // /2024/jan/ - year/month name only
            {
              regex: /\/(\d{4})\/([a-z]{3,9})\//i,
              extract: (m, self) => {
                const monthNum = self.monthNames[m[2].toLowerCase()];
                return monthNum ? { year: m[1], month: monthNum, day: null, format: "YYYY/mon", monthName: m[2].toLowerCase() } : null;
              }
            }
          ];
        }
        /**
         * Extract the date segment fact
         * 
         * @param {string|URL|Object} input - URL to analyze
         * @returns {FactResult}
         */
        extract(input) {
          const url = this.parseUrl(input);
          for (const { regex, extract } of this.patterns) {
            const match = url.pathname.match(regex);
            if (match) {
              const components = extract(match, this);
              if (!components) continue;
              const month = parseInt(components.month, 10);
              const day = components.day ? parseInt(components.day, 10) : null;
              if (month >= 1 && month <= 12 && (day === null || day >= 1 && day <= 31)) {
                return this.createFact(true, {
                  pattern: match[0],
                  ...components
                });
              }
            }
          }
          return this.createFact(false, { reason: "No date pattern found in URL path" });
        }
      };
      module.exports = { HasDateSegment };
    }
  });

  // src/facts/url/HasSlugPattern.js
  var require_HasSlugPattern = __commonJS({
    "src/facts/url/HasSlugPattern.js"(exports, module) {
      "use strict";
      var { UrlFact } = require_UrlFact();
      var HasSlugPattern = class extends UrlFact {
        constructor() {
          super({
            name: "url.hasSlugPattern",
            description: "URL path ends with a human-readable slug (hyphenated words)"
          });
          this.minWords = 3;
          this.wordPattern = /^[a-z0-9]+$/i;
          this.extensionPattern = /\.(html?|php|aspx?|jsp)$/i;
        }
        /**
         * Extract the slug pattern fact
         * 
         * @param {string|URL|Object} input - URL to analyze
         * @returns {FactResult}
         */
        extract(input) {
          const url = this.parseUrl(input);
          let lastSegment = this.getLastSegment(url);
          if (!lastSegment) {
            return this.createFact(false, { reason: "No path segments" });
          }
          lastSegment = lastSegment.replace(this.extensionPattern, "");
          let words = lastSegment.split("-");
          let separator = "-";
          if (words.length < this.minWords) {
            const underscoreWords = lastSegment.split("_");
            if (underscoreWords.length >= this.minWords) {
              words = underscoreWords;
              separator = "_";
            }
          }
          const validWords = words.filter((w) => this.wordPattern.test(w) && w.length >= 2);
          if (validWords.length >= this.minWords) {
            return this.createFact(true, {
              slug: lastSegment,
              separator,
              wordCount: validWords.length,
              words: validWords
            });
          }
          if (words.length < this.minWords) {
            return this.createFact(false, {
              reason: `Too few words (${words.length} < ${this.minWords})`,
              segment: lastSegment
            });
          }
          return this.createFact(false, {
            reason: "Does not match slug pattern",
            segment: lastSegment
          });
        }
      };
      module.exports = { HasSlugPattern };
    }
  });

  // src/facts/url/HasNewsKeyword.js
  var require_HasNewsKeyword = __commonJS({
    "src/facts/url/HasNewsKeyword.js"(exports, module) {
      "use strict";
      var { UrlFact } = require_UrlFact();
      var HasNewsKeyword = class extends UrlFact {
        constructor() {
          super({
            name: "url.hasNewsKeyword",
            description: "URL path contains a news-related segment like /news/, /article/, /story/"
          });
          this.keywords = /* @__PURE__ */ new Set([
            "news",
            "article",
            "articles",
            "story",
            "stories",
            "post",
            "posts",
            "blog",
            "press",
            "press-release",
            "press-releases",
            "breaking",
            "latest",
            "opinion",
            "editorial",
            "editorials",
            "column",
            "columns",
            "feature",
            "features",
            "report",
            "reports",
            "update",
            "updates",
            "headline",
            "headlines"
          ]);
        }
        /**
         * Extract the news keyword fact
         * 
         * @param {string|URL|Object} input - URL to analyze
         * @returns {FactResult}
         */
        extract(input) {
          const url = this.parseUrl(input);
          const segments = this.getPathSegments(url);
          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i].toLowerCase();
            if (this.keywords.has(segment)) {
              return this.createFact(true, {
                keyword: segment,
                position: i,
                segment: segments[i]
              });
            }
          }
          return this.createFact(false, {
            reason: "No news keywords found in path segments",
            segments
          });
        }
      };
      module.exports = { HasNewsKeyword };
    }
  });

  // src/facts/url/HasPaginationPattern.js
  var require_HasPaginationPattern = __commonJS({
    "src/facts/url/HasPaginationPattern.js"(exports, module) {
      "use strict";
      var { UrlFact } = require_UrlFact();
      var HasPaginationPattern = class extends UrlFact {
        constructor() {
          super({
            name: "url.hasPaginationPattern",
            description: "URL contains pagination indicators (page numbers, offsets)"
          });
          this.paginationParams = /* @__PURE__ */ new Set([
            "page",
            "p",
            "pg",
            "paged",
            "offset",
            "start",
            "skip",
            "from",
            "pagenum",
            "page_num",
            "pagenumber"
          ]);
          this.pathPatterns = [
            // /page/2, /page/3, etc.
            /\/page\/(\d+)\/?$/i,
            // /p/2, /p/3 (short form)
            /\/p\/(\d+)\/?$/i,
            // Some sites use just /2/, /3/ at the end
            /\/(\d+)\/?$/
          ];
        }
        /**
         * Extract the pagination pattern fact
         * 
         * @param {string|URL|Object} input - URL to analyze
         * @returns {FactResult}
         */
        extract(input) {
          const url = this.parseUrl(input);
          for (const [param, value] of url.searchParams) {
            if (this.paginationParams.has(param.toLowerCase())) {
              if (/^\d+$/.test(value)) {
                return this.createFact(true, {
                  type: "query",
                  param,
                  value,
                  pageNumber: parseInt(value, 10)
                });
              }
            }
          }
          for (const pattern of this.pathPatterns) {
            const match = url.pathname.match(pattern);
            if (match) {
              const pageNum = parseInt(match[1], 10);
              if (pageNum > 1 && pageNum < 1e3) {
                return this.createFact(true, {
                  type: "path",
                  pattern: pattern.toString(),
                  value: match[1],
                  pageNumber: pageNum
                });
              }
            }
          }
          return this.createFact(false, { reason: "No pagination pattern detected" });
        }
      };
      module.exports = { HasPaginationPattern };
    }
  });

  // src/facts/url/IsHomepage.js
  var require_IsHomepage = __commonJS({
    "src/facts/url/IsHomepage.js"(exports, module) {
      "use strict";
      var { UrlFact } = require_UrlFact();
      var IsHomepage = class extends UrlFact {
        constructor() {
          super({
            name: "url.isHomepage",
            description: "URL is a homepage or index page (not an article)"
          });
          this.indexPatterns = [
            /^\/?(index|default|home)\.(html?|php|aspx?|jsp)$/i,
            /^\/?(index|default|home)\/?$/i,
            /^\/?$/
            // Root path
          ];
        }
        /**
         * Extract the homepage fact
         * 
         * @param {string|URL|Object} input - URL to analyze
         * @returns {FactResult}
         */
        extract(input) {
          const url = this.parseUrl(input);
          const path = url.pathname;
          if (path === "/" || path === "") {
            return this.createFact(true, {
              pattern: "root",
              path
            });
          }
          for (const pattern of this.indexPatterns) {
            if (pattern.test(path)) {
              return this.createFact(true, {
                pattern: "index",
                path,
                matchedPattern: pattern.toString()
              });
            }
          }
          return this.createFact(false, {
            reason: "Path does not match homepage patterns",
            path
          });
        }
      };
      module.exports = { IsHomepage };
    }
  });

  // src/facts/url/index.js
  var require_url = __commonJS({
    "src/facts/url/index.js"(exports, module) {
      "use strict";
      var { UrlFact } = require_UrlFact();
      var { HasDateSegment } = require_HasDateSegment();
      var { HasSlugPattern } = require_HasSlugPattern();
      var { HasNewsKeyword } = require_HasNewsKeyword();
      var { HasPaginationPattern } = require_HasPaginationPattern();
      var { IsHomepage } = require_IsHomepage();
      var URL_FACTS = [
        HasDateSegment,
        HasSlugPattern,
        HasNewsKeyword,
        HasPaginationPattern,
        IsHomepage
      ];
      function createAllUrlFacts() {
        return URL_FACTS.map((FactClass) => new FactClass());
      }
      module.exports = {
        // Base class
        UrlFact,
        // Concrete facts
        HasDateSegment,
        HasSlugPattern,
        HasNewsKeyword,
        HasPaginationPattern,
        IsHomepage,
        // Registry helpers
        URL_FACTS,
        createAllUrlFacts
      };
    }
  });

  // src/ui/client/facts-client.js
  var require_facts_client = __commonJS({
    "src/ui/client/facts-client.js"(exports, module) {
      var { createAllUrlFacts } = require_url();
      function initFactsPopup() {
        const urlFacts = createAllUrlFacts();
        const popupEl = document.querySelector("[data-control='UrlFactsPopup']");
        if (!popupEl) {
          console.warn("[FactsClient] No popup element found on page");
          return null;
        }
        const backdrop = popupEl.querySelector("[data-role='backdrop']");
        const closeBtn = popupEl.querySelector("[data-role='close']");
        const urlDisplay = popupEl.querySelector("[data-role='url-display']");
        const factsList = popupEl.querySelector("[data-role='facts-list']");
        function show(url) {
          if (!url) return;
          urlDisplay.innerHTML = "";
          const urlText = document.createElement("code");
          urlText.className = "lux-facts-popup__url-text";
          urlText.textContent = url;
          urlDisplay.appendChild(urlText);
          factsList.innerHTML = "";
          urlFacts.forEach((fact) => {
            try {
              const result = fact.extract(url);
              const factItem = createFactItem(result);
              factsList.appendChild(factItem);
            } catch (err) {
              console.error(`[FactsClient] Error computing ${fact.name}:`, err);
              const errorItem = createErrorItem(fact.name, err.message);
              factsList.appendChild(errorItem);
            }
          });
          popupEl.style.display = "flex";
          document.body.classList.add("lux-popup-open");
        }
        function hide() {
          popupEl.style.display = "none";
          document.body.classList.remove("lux-popup-open");
        }
        function createFactItem(result) {
          const item = document.createElement("div");
          item.className = `lux-fact-item ${result.value ? "lux-fact-item--true" : "lux-fact-item--false"}`;
          const indicator = document.createElement("span");
          indicator.className = "lux-fact-item__indicator";
          indicator.textContent = result.value ? "\u25C6" : "\u25C7";
          item.appendChild(indicator);
          const content = document.createElement("div");
          content.className = "lux-fact-item__content";
          const name = document.createElement("div");
          name.className = "lux-fact-item__name";
          name.textContent = result.name;
          content.appendChild(name);
          if (result.evidence) {
            const evidence = document.createElement("div");
            evidence.className = "lux-fact-item__evidence";
            evidence.textContent = formatEvidence(result.evidence);
            content.appendChild(evidence);
          }
          item.appendChild(content);
          const badge = document.createElement("span");
          badge.className = "lux-fact-item__badge";
          badge.textContent = result.value ? "TRUE" : "FALSE";
          item.appendChild(badge);
          return item;
        }
        function createErrorItem(factName, errorMessage) {
          const item = document.createElement("div");
          item.className = "lux-fact-item lux-fact-item--error";
          const indicator = document.createElement("span");
          indicator.className = "lux-fact-item__indicator";
          indicator.textContent = "\u26A0";
          item.appendChild(indicator);
          const content = document.createElement("div");
          content.className = "lux-fact-item__content";
          const name = document.createElement("div");
          name.className = "lux-fact-item__name";
          name.textContent = factName;
          content.appendChild(name);
          const error = document.createElement("div");
          error.className = "lux-fact-item__evidence lux-fact-item__evidence--error";
          error.textContent = `Error: ${errorMessage}`;
          content.appendChild(error);
          item.appendChild(content);
          return item;
        }
        function formatEvidence(evidence) {
          if (!evidence || typeof evidence !== "object") return "";
          const parts = [];
          for (const [key, value] of Object.entries(evidence)) {
            if (value === null || value === void 0) continue;
            if (key === "reason" && typeof value === "string" && value.includes("No ")) continue;
            parts.push(`${key}: ${value}`);
          }
          return parts.join(" \xB7 ");
        }
        if (backdrop) {
          backdrop.addEventListener("click", hide);
        }
        if (closeBtn) {
          closeBtn.addEventListener("click", hide);
        }
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && popupEl.style.display !== "none") {
            hide();
          }
        });
        document.querySelectorAll(".lux-url-list .is-url a").forEach((link) => {
          link.addEventListener("click", (e) => {
            e.preventDefault();
            const url = link.getAttribute("title") || link.textContent;
            show(url);
          });
        });
        console.log("[FactsClient] Initialized with", urlFacts.length, "URL facts");
        return { show, hide };
      }
      function bootstrap() {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", initFactsPopup);
        } else {
          initFactsPopup();
        }
      }
      bootstrap();
      if (typeof window !== "undefined") {
        window.FactsClient = {
          init: initFactsPopup
        };
      }
      module.exports = { initFactsPopup };
    }
  });
  require_facts_client();
})();
//# sourceMappingURL=facts-client.js.map
