'use strict';

/**
 * Mobile UI Module
 * 
 * Exports mobile-specific UI components for PWA functionality.
 * 
 * @module mobile
 */

const { MobileArticleView, getMobileArticleViewCss } = require('./MobileArticleView');
const { OfflineManager, STORES, DB_NAME, DB_VERSION } = require('./OfflineManager');

module.exports = {
  MobileArticleView,
  getMobileArticleViewCss,
  OfflineManager,
  STORES,
  DB_NAME,
  DB_VERSION
};
