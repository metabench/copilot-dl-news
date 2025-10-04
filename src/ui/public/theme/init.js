import { createBrowserThemeController } from './browserController.js';

const controller = createBrowserThemeController();

if (typeof window !== 'undefined') {
  window.__themeController = controller;
}
