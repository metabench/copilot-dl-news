'use strict';

/**
 * TextRank - Graph-based sentence ranking algorithm
 * 
 * Implements the TextRank algorithm for extractive summarization:
 * 1. Build a graph where sentences are nodes
 * 2. Edge weights are cosine similarity between TF-IDF vectors
 * 3. Run PageRank iteration to rank sentences
 * 4. Select top-k sentences for summary
 * 
 * Based on: Mihalcea & Tarau (2004) "TextRank: Bringing Order into Texts"
 * 
 * @module TextRank
 */

const { TfIdfVectorizer } = require('./TfIdfVectorizer');

// Default damping factor (like PageRank)
const DEFAULT_DAMPING = 0.85;

// Default convergence threshold
const DEFAULT_CONVERGENCE = 0.0001;

// Maximum iterations to prevent infinite loops
const MAX_ITERATIONS = 100;

// Minimum similarity to create an edge
const MIN_SIMILARITY = 0.1;

/**
 * TextRank class for sentence ranking
 */
class TextRank {
  /**
   * Create a TextRank instance
   * @param {Object} [options] - Configuration options
   * @param {number} [options.damping=0.85] - Damping factor for PageRank
   * @param {number} [options.convergence=0.0001] - Convergence threshold
   * @param {number} [options.maxIterations=100] - Maximum iterations
   * @param {number} [options.minSimilarity=0.1] - Minimum similarity for edges
   */
  constructor(options = {}) {
    this.damping = options.damping ?? DEFAULT_DAMPING;
    this.convergence = options.convergence ?? DEFAULT_CONVERGENCE;
    this.maxIterations = options.maxIterations ?? MAX_ITERATIONS;
    this.minSimilarity = options.minSimilarity ?? MIN_SIMILARITY;
  }
  
  /**
   * Rank sentences using TextRank algorithm
   * 
   * @param {string[]} sentences - Array of sentence texts
   * @returns {Array<{index: number, score: number, text: string}>} Ranked sentences
   */
  rank(sentences) {
    if (!sentences || sentences.length === 0) {
      return [];
    }
    
    // Single sentence = return as-is
    if (sentences.length === 1) {
      return [{
        index: 0,
        score: 1.0,
        text: sentences[0]
      }];
    }
    
    // Step 1: Vectorize sentences
    const vectorizer = new TfIdfVectorizer({ normalize: true });
    const vectors = vectorizer.fitTransform(sentences);
    
    // Step 2: Build similarity matrix (adjacency weights)
    const n = sentences.length;
    const similarity = TfIdfVectorizer.buildSimilarityMatrix(vectors);
    
    // Apply minimum similarity threshold
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && similarity[i][j] < this.minSimilarity) {
          similarity[i][j] = 0;
        }
      }
    }
    
    // Step 3: Calculate out-degree (sum of outgoing weights)
    const outDegree = similarity.map(row => row.reduce((sum, val) => sum + val, 0));
    
    // Step 4: Initialize scores uniformly
    let scores = new Array(n).fill(1.0 / n);
    let newScores = new Array(n);
    
    // Step 5: Iterate until convergence
    let iterations = 0;
    let delta = Infinity;
    
    while (delta > this.convergence && iterations < this.maxIterations) {
      delta = 0;
      
      for (let i = 0; i < n; i++) {
        // score[i] = (1-d) + d * Σ(similarity[j,i] * score[j] / out_degree[j])
        let sum = 0;
        
        for (let j = 0; j < n; j++) {
          if (i !== j && outDegree[j] > 0) {
            sum += similarity[j][i] * scores[j] / outDegree[j];
          }
        }
        
        newScores[i] = (1 - this.damping) / n + this.damping * sum;
        delta = Math.max(delta, Math.abs(newScores[i] - scores[i]));
      }
      
      // Swap score arrays
      [scores, newScores] = [newScores, scores];
      iterations++;
    }
    
    // Step 6: Create ranked result
    const ranked = sentences.map((text, index) => ({
      index,
      score: scores[index],
      text
    }));
    
    // Sort by score descending
    ranked.sort((a, b) => b.score - a.score);
    
    // Normalize scores to sum to 1
    const totalScore = ranked.reduce((sum, s) => sum + s.score, 0);
    if (totalScore > 0) {
      for (const item of ranked) {
        item.score = item.score / totalScore;
      }
    }
    
    return ranked;
  }
  
  /**
   * Select top sentences and preserve original order
   * 
   * @param {Array<{index: number, score: number, text: string}>} rankedSentences - Ranked sentences
   * @param {number} count - Number of sentences to select
   * @returns {Array<{index: number, score: number, text: string}>} Selected sentences in original order
   */
  selectTop(rankedSentences, count) {
    if (!rankedSentences || rankedSentences.length === 0) {
      return [];
    }
    
    // Take top-k by score
    const topK = rankedSentences.slice(0, Math.min(count, rankedSentences.length));
    
    // Sort by original index to preserve order
    topK.sort((a, b) => a.index - b.index);
    
    return topK;
  }
  
  /**
   * Summarize text by selecting top sentences
   * 
   * @param {string[]} sentences - Array of sentence texts
   * @param {number} count - Number of sentences to select
   * @returns {Array<{index: number, score: number, text: string}>} Selected sentences
   */
  summarize(sentences, count) {
    const ranked = this.rank(sentences);
    return this.selectTop(ranked, count);
  }
  
  /**
   * Get statistics from last ranking
   * @param {Array<{index: number, score: number, text: string}>} rankedSentences
   * @returns {Object} Stats
   */
  static getStats(rankedSentences) {
    if (!rankedSentences || rankedSentences.length === 0) {
      return {
        sentenceCount: 0,
        maxScore: 0,
        minScore: 0,
        avgScore: 0
      };
    }
    
    const scores = rankedSentences.map(s => s.score);
    
    return {
      sentenceCount: rankedSentences.length,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      avgScore: scores.reduce((a, b) => a + b, 0) / scores.length
    };
  }
}

module.exports = {
  TextRank,
  DEFAULT_DAMPING,
  DEFAULT_CONVERGENCE,
  MAX_ITERATIONS,
  MIN_SIMILARITY
};
