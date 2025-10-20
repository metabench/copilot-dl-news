import {
  createThemeController,
  DEFAULT_THEMES
} from '../../shared/theme/themeController.js';

function createBrowserThemeController(options = {}) {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserThemeController requires a browser environment');
  }

  const {
    themes = DEFAULT_THEMES,
    storageKey = 'theme',
    hashParam = 'theme_name',
    defaultTheme = 'light',
    fallbackTheme = themes[0] ? themes[0].name : 'light',
    root = document.documentElement,
    disableStorage = false
  } = options;

  const readStorage = disableStorage
    ? null
    : (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch (err) {
          return null;
        }
      };

  const writeStorage = disableStorage
    ? null
    : (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch (err) {
          /* noop */
        }
      };

  const removeStorage = disableStorage
    ? null
    : (key) => {
        try {
          window.localStorage.removeItem(key);
        } catch (err) {
          /* noop */
        }
      };

  const controller = createThemeController({
    themes,
    storageKey,
    hashParam,
    defaultTheme,
    fallbackTheme,
    locationHash: window.location ? window.location.hash : '',
    systemPrefersDark: typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
    readStorage,
    writeStorage,
    removeStorage,
    onThemeApplied: ({ theme, classes, allClasses }) => {
      if (!root || !root.classList) {
        return;
      }
      allClasses.forEach((cls) => {
        if (cls) {
          root.classList.remove(cls);
        }
      });
      classes.forEach((cls) => {
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

export {
  createBrowserThemeController
};
