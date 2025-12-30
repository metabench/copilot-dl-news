'use strict';

/**
 * Article Recommendation Engine Module
 * 
 * Recommends related articles based on:
 * - Content similarity (SimHash from Content Similarity Engine)
 * - Tag similarity (Keywords/Categories from Tagging Service)
 * - Trending signals (Recency-weighted view counts)
 * 
 * @module recommendations
 */

const { TrendingCalculator, createTrendingCalculator } = require('./TrendingCalculator');
const { ContentRecommender, createContentRecommender } = require('./ContentRecommender');
const { TagRecommender, createTagRecommender } = require('./TagRecommender');
const { RecommendationEngine, createRecommendationEngine } = require('./RecommendationEngine');

module.exports = {
  TrendingCalculator,
  createTrendingCalculator,
  ContentRecommender,
  createContentRecommender,
  TagRecommender,
  createTagRecommender,
  RecommendationEngine,
  createRecommendationEngine
};
