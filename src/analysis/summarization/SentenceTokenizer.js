'use strict';

/**
 * SentenceTokenizer - Split text into sentences
 * 
 * Tokenizes text into individual sentences with proper handling of:
 * - Common abbreviations (Mr., Dr., U.S., etc.)
 * - Decimal numbers (3.14)
 * - Quoted text
 * - Multiple punctuation marks (!!, ?!, ...)
 * 
 * @module SentenceTokenizer
 */

// Common abbreviations that shouldn't end sentences
const ABBREVIATIONS = new Set([
  // Titles
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'rev', 'gov', 'sen', 'rep',
  'hon', 'gen', 'col', 'lt', 'sgt', 'cpl', 'pvt', 'capt', 'cmdr', 'adm',
  // Academic
  'ph', 'b', 'm', 'd', 'phd', 'md', 'mba', 'ma', 'ba', 'bs', 'esq',
  // Organizations/Places
  'inc', 'corp', 'ltd', 'co', 'llc', 'dept', 'div', 'assn', 'univ',
  'st', 'ave', 'blvd', 'rd', 'ct', 'pl', 'sq', 'mt',
  // Countries/States
  'u', 's', 'u.s', 'us', 'uk', 'e', 'i', 'n', 'w', 'ne', 'nw', 'se', 'sw',
  // Common abbreviations
  'vs', 'etc', 'al', 'eg', 'ie', 'cf', 'viz', 'approx', 'est', 'min', 'max',
  'no', 'nos', 'fig', 'figs', 'vol', 'vols', 'ed', 'eds', 'pp', 'p', 'ch',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'
]);

// Sentence-ending punctuation pattern
const SENTENCE_ENDERS = /[.!?]+/;

// Pattern to detect abbreviations at end of token
const ABBREV_PATTERN = /^([a-z]+)\.$/i;

// Pattern for decimal numbers
const DECIMAL_PATTERN = /^\d+\.\d+$/;

/**
 * Check if a word ending with period is an abbreviation
 * @param {string} word - Word to check (with period)
 * @param {string} nextWord - Next word (for capitalization check)
 * @returns {boolean} True if likely an abbreviation
 */
function isAbbreviation(word, nextWord = '') {
  // Remove trailing periods
  const base = word.replace(/\.+$/, '').toLowerCase();
  
  // Check known abbreviations
  if (ABBREVIATIONS.has(base)) {
    return true;
  }
  
  // Single letter followed by period (e.g., "A. Smith")
  if (base.length === 1 && /[a-z]/i.test(base)) {
    return true;
  }
  
  // Check if next word starts with lowercase (unlikely sentence start)
  if (nextWord && /^[a-z]/.test(nextWord)) {
    return true;
  }
  
  return false;
}

/**
 * Tokenize text into sentences
 * 
 * @param {string} text - Input text
 * @returns {Array<{text: string, start: number, end: number, index: number}>} Sentences
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  if (normalized.length === 0) {
    return [];
  }
  
  const sentences = [];
  let currentSentence = '';
  let sentenceStart = 0;
  let inQuote = false;
  let i = 0;
  
  while (i < normalized.length) {
    const char = normalized[i];
    const prevChar = i > 0 ? normalized[i - 1] : '';
    const nextChar = i < normalized.length - 1 ? normalized[i + 1] : '';
    
    // Track quotes
    if (char === '"' || char === '"' || char === '"') {
      inQuote = !inQuote;
    }
    
    currentSentence += char;
    
    // Check for sentence end
    if (SENTENCE_ENDERS.test(char)) {
      // Look ahead for more punctuation (e.g., "..." or "!?")
      let endIdx = i;
      while (endIdx < normalized.length - 1 && SENTENCE_ENDERS.test(normalized[endIdx + 1])) {
        endIdx++;
        currentSentence += normalized[endIdx];
      }
      
      // Include trailing quote if inside quotes
      if (inQuote && (normalized[endIdx + 1] === '"' || normalized[endIdx + 1] === '"')) {
        endIdx++;
        currentSentence += normalized[endIdx];
        inQuote = false;
      }
      
      // Check if this is actually a sentence end
      let isSentenceEnd = true;
      
      // Get the word before the period
      const beforePunctMatch = currentSentence.match(/(\S+)[.!?]+[""]?$/);
      const wordBeforePunct = beforePunctMatch ? beforePunctMatch[1] : '';
      
      // Get the next word
      let nextWordStart = endIdx + 1;
      while (nextWordStart < normalized.length && /\s/.test(normalized[nextWordStart])) {
        nextWordStart++;
      }
      let nextWordEnd = nextWordStart;
      while (nextWordEnd < normalized.length && /\S/.test(normalized[nextWordEnd])) {
        nextWordEnd++;
      }
      const nextWord = normalized.slice(nextWordStart, nextWordEnd);
      
      // Check for abbreviations (only for periods)
      if (char === '.' && wordBeforePunct) {
        // Check if the word with period is an abbreviation
        if (isAbbreviation(wordBeforePunct + '.', nextWord)) {
          isSentenceEnd = false;
        }
        
        // Check for decimal numbers
        const numberMatch = currentSentence.match(/(\d+\.\d*)$/);
        if (numberMatch && nextWord && /^\d/.test(nextWord)) {
          isSentenceEnd = false;
        }
        
        // Check for initials (e.g., "J. K. Rowling")
        if (wordBeforePunct.length === 1 && /[A-Z]/.test(wordBeforePunct)) {
          // Check if next word is also an initial or a capitalized name
          if (nextWord && (/^[A-Z]\.$/.test(nextWord) || /^[A-Z][a-z]/.test(nextWord))) {
            isSentenceEnd = false;
          }
        }
      }
      
      // If we're inside quotes, might need to continue
      if (inQuote) {
        isSentenceEnd = false;
      }
      
      if (isSentenceEnd && currentSentence.trim().length > 0) {
        const trimmed = currentSentence.trim();
        sentences.push({
          text: trimmed,
          start: sentenceStart,
          end: sentenceStart + trimmed.length,
          index: sentences.length
        });
        currentSentence = '';
        sentenceStart = endIdx + 1;
        
        // Skip whitespace for next sentence start
        while (sentenceStart < normalized.length && /\s/.test(normalized[sentenceStart])) {
          sentenceStart++;
        }
      }
      
      i = endIdx;
    }
    
    i++;
  }
  
  // Handle remaining text (no final punctuation)
  const remaining = currentSentence.trim();
  if (remaining.length > 0) {
    sentences.push({
      text: remaining,
      start: sentenceStart,
      end: sentenceStart + remaining.length,
      index: sentences.length
    });
  }
  
  return sentences;
}

/**
 * Simple sentence splitter (less sophisticated, but faster)
 * Splits on .!? followed by space and capital letter
 * 
 * @param {string} text - Input text
 * @returns {string[]} Array of sentence strings
 */
function simpleSplit(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Protect common abbreviations
  let processedText = text;
  const abbrevPlaceholders = [];
  
  for (const abbr of ABBREVIATIONS) {
    const pattern = new RegExp(`\\b${abbr}\\.`, 'gi');
    processedText = processedText.replace(pattern, (match) => {
      const placeholder = `__ABBR_${abbrevPlaceholders.length}__`;
      abbrevPlaceholders.push(match);
      return placeholder;
    });
  }
  
  // Split on sentence boundaries
  const parts = processedText.split(/(?<=[.!?])\s+(?=[A-Z])/);
  
  // Restore abbreviations
  return parts.map(part => {
    let restored = part;
    abbrevPlaceholders.forEach((abbr, idx) => {
      restored = restored.replace(`__ABBR_${idx}__`, abbr);
    });
    return restored.trim();
  }).filter(s => s.length > 0);
}

/**
 * Count words in text
 * @param {string} text - Input text
 * @returns {number} Word count
 */
function countWords(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Truncate text to approximately N words
 * @param {string} text - Input text
 * @param {number} maxWords - Maximum words
 * @returns {string} Truncated text
 */
function truncateToWords(text, maxWords) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= maxWords) {
    return text;
  }
  
  return words.slice(0, maxWords).join(' ') + '...';
}

module.exports = {
  tokenize,
  simpleSplit,
  countWords,
  truncateToWords,
  isAbbreviation,
  ABBREVIATIONS
};
