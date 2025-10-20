import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __commonJS
} from "./chunk-QU4DACYI.js";

// src/ui/shared/theme/themeController.js
var require_themeController = __commonJS({
  "src/ui/shared/theme/themeController.js"(exports, module) {
    var { each, tof } = require_lang();
    var DEFAULT_THEMES = Object.freeze([
      { name: "light", classes: [] },
      { name: "dark", classes: ["dark"] }
    ]);
    function buildRegistry(themes) {
      const registry = /* @__PURE__ */ new Map();
      each(themes, (theme) => {
        if (!theme || !theme.name) {
          return;
        }
        const key = String(theme.name).toLowerCase();
        const classes = Array.from(new Set((theme.classes || theme.htmlClasses || []).filter(Boolean)));
        registry.set(key, {
          name: theme.name,
          classes,
          meta: theme.meta || null
        });
      });
      return registry;
    }
    function normaliseThemeName(name, themes, registry) {
      if (!name) {
        return null;
      }
      const map = registry || buildRegistry(themes || DEFAULT_THEMES);
      const key = String(name).toLowerCase().trim();
      if (!key) {
        return null;
      }
      const entry = map.get(key);
      return entry ? entry.name : null;
    }
    function parseThemeFromHash(hash, opts = {}) {
      const { param = "theme_name" } = opts;
      if (!hash || typeof hash !== "string") {
        return null;
      }
      let trimmed = hash.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith("#")) {
        trimmed = trimmed.slice(1);
      }
      if (!trimmed) {
        return null;
      }
      const possible = trimmed.replace(/^!+/, "");
      const query = possible.includes("=") ? possible : `${param}=${possible}`;
      const params = new URLSearchParams(query);
      const keys = [param, "theme", "themeName"];
      for (const key of keys) {
        if (params.has(key)) {
          const value = params.get(key);
          if (value) {
            return value.trim();
          }
        }
      }
      return null;
    }
    function resolveThemeName(args = {}) {
      const {
        themes = DEFAULT_THEMES,
        registry = buildRegistry(themes),
        requested,
        stored,
        systemPrefersDark = false,
        defaultTheme = "light",
        fallbackTheme = themes[0] ? themes[0].name : "light"
      } = args;
      const normalise = (value) => normaliseThemeName(value, themes, registry);
      return normalise(requested) || normalise(stored) || (systemPrefersDark ? normalise("dark") : null) || normalise(defaultTheme) || normalise(fallbackTheme) || (themes[0] ? themes[0].name : "light");
    }
    function createThemeController(options = {}) {
      const {
        themes = DEFAULT_THEMES,
        storageKey = "theme",
        defaultTheme = "light",
        fallbackTheme = themes[0] ? themes[0].name : "light",
        hashParam = "theme_name",
        locationHash = "",
        systemPrefersDark = false,
        readStorage = null,
        writeStorage = null,
        removeStorage = null,
        onThemeApplied = null
      } = options;
      const registry = buildRegistry(themes);
      const listeners = /* @__PURE__ */ new Set();
      let currentTheme = null;
      let lastAppliedSource = null;
      const allClasses = Array.from(new Set(
        themes.flatMap((theme) => (theme.classes || theme.htmlClasses || []).filter(Boolean))
      ));
      const callListeners = (payload) => {
        each(listeners, (listener) => {
          try {
            listener(payload);
          } catch (err) {
          }
        });
      };
      const apply = (themeName, { persist = true, source = "manual" } = {}) => {
        const normalised = normaliseThemeName(themeName, themes, registry) || normaliseThemeName(defaultTheme, themes, registry) || fallbackTheme;
        const key = String(normalised).toLowerCase();
        const entry = registry.get(key) || registry.values().next().value;
        if (!entry) {
          return null;
        }
        currentTheme = entry.name;
        lastAppliedSource = source;
        if (persist && tof(writeStorage) === "function") {
          try {
            writeStorage(storageKey, currentTheme);
          } catch (err) {
          }
        }
        const payload = {
          theme: currentTheme,
          classes: [...entry.classes],
          allClasses,
          meta: entry.meta,
          source
        };
        if (tof(onThemeApplied) === "function") {
          try {
            onThemeApplied(payload);
          } catch (err) {
          }
        }
        callListeners(payload);
        return currentTheme;
      };
      const init = () => {
        if (currentTheme) {
          return currentTheme;
        }
        let storedTheme = null;
        if (tof(readStorage) === "function") {
          try {
            storedTheme = readStorage(storageKey);
          } catch (err) {
            storedTheme = null;
          }
        }
        const hashThemeRaw = parseThemeFromHash(locationHash, { param: hashParam });
        const hashTheme = normaliseThemeName(hashThemeRaw, themes, registry);
        const resolved = resolveThemeName({
          themes,
          registry,
          requested: hashTheme,
          stored: storedTheme,
          systemPrefersDark,
          defaultTheme,
          fallbackTheme
        });
        apply(resolved, { persist: !hashTheme, source: hashTheme ? "hash" : storedTheme ? "stored" : "auto" });
        return currentTheme;
      };
      const setTheme = (nextTheme, opts = {}) => {
        const { persist = true } = opts;
        return apply(nextTheme, { persist, source: persist ? "manual" : opts.source || "manual" });
      };
      const getTheme = () => {
        if (!currentTheme) {
          return init();
        }
        return currentTheme;
      };
      const subscribe = (listener) => {
        if (typeof listener !== "function") {
          return () => {
          };
        }
        listeners.add(listener);
        if (currentTheme) {
          const entry = registry.get(String(currentTheme).toLowerCase());
          const payload = {
            theme: currentTheme,
            classes: entry ? [...entry.classes] : [],
            allClasses,
            meta: entry ? entry.meta : null,
            source: lastAppliedSource || "manual"
          };
          try {
            listener(payload);
          } catch (err) {
          }
        }
        return () => {
          listeners.delete(listener);
        };
      };
      const clearStoredTheme = () => {
        if (tof(removeStorage) === "function") {
          try {
            removeStorage(storageKey);
          } catch (err) {
          }
        }
      };
      return {
        init,
        setTheme,
        getTheme,
        subscribe,
        availableThemes: () => themes.map((theme) => theme.name),
        getThemeClasses: (themeName) => {
          const resolved = normaliseThemeName(themeName || currentTheme, themes, registry);
          if (!resolved) {
            return [];
          }
          const entry = registry.get(String(resolved).toLowerCase());
          return entry ? [...entry.classes] : [];
        },
        clearStoredTheme,
        parseThemeFromHash: (hash) => parseThemeFromHash(hash, { param: hashParam }),
        resolveThemeName: (input = {}) => resolveThemeName({
          themes,
          registry,
          defaultTheme,
          fallbackTheme,
          ...input
        })
      };
    }
    module.exports = {
      DEFAULT_THEMES,
      createThemeController,
      parseThemeFromHash,
      resolveThemeName,
      normaliseThemeName
    };
  }
});

// src/ui/public/theme/browserController.js
var require_browserController = __commonJS({
  "src/ui/public/theme/browserController.js"(exports, module) {
    var { each } = require_lang();
    var {
      createThemeController,
      DEFAULT_THEMES
    } = require_themeController();
    function createBrowserThemeController(options = {}) {
      if (typeof window === "undefined") {
        throw new Error("createBrowserThemeController requires a browser environment");
      }
      const {
        themes = DEFAULT_THEMES,
        storageKey = "theme",
        hashParam = "theme_name",
        defaultTheme = "light",
        fallbackTheme = themes[0] ? themes[0].name : "light",
        root = document.documentElement,
        disableStorage = false
      } = options;
      const readStorage = disableStorage ? null : (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch (err) {
          return null;
        }
      };
      const writeStorage = disableStorage ? null : (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch (err) {
        }
      };
      const removeStorage = disableStorage ? null : (key) => {
        try {
          window.localStorage.removeItem(key);
        } catch (err) {
        }
      };
      const controller = createThemeController({
        themes,
        storageKey,
        hashParam,
        defaultTheme,
        fallbackTheme,
        locationHash: window.location ? window.location.hash : "",
        systemPrefersDark: typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false,
        readStorage,
        writeStorage,
        removeStorage,
        onThemeApplied: ({ theme, classes, allClasses }) => {
          if (!root || !root.classList) {
            return;
          }
          each(allClasses, (cls) => {
            if (cls) {
              root.classList.remove(cls);
            }
          });
          each(classes, (cls) => {
            if (cls) {
              root.classList.add(cls);
            }
          });
          root.dataset.theme = theme;
        }
      });
      controller.init();
      return controller;
    }
    module.exports = {
      createBrowserThemeController
    };
  }
});

export {
  require_browserController
};
