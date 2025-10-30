// Shared text metrics helpers used across the crawler and analysis pipeline.

const WORD_BOUNDARY_REGEX = /\s+/g;

function countWords(text) {
  if (typeof text !== 'string') {
    return 0;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(WORD_BOUNDARY_REGEX).filter(Boolean).length;
}

module.exports = {
  WORD_BOUNDARY_REGEX,
  countWords
};
