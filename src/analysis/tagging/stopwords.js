'use strict';

/**
 * English Stopwords List
 * 
 * Common words that should be excluded from TF-IDF keyword extraction.
 * These words appear frequently but carry little semantic meaning.
 * 
 * @module stopwords
 */

const STOPWORDS = new Set([
  // Articles
  'a', 'an', 'the',
  
  // Pronouns
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  
  // Verbs (common)
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'would', 'should', 'could', 'ought', 'might', 'must', 'shall', 'will', 'can',
  'need', 'dare', 'may', 'get', 'got', 'getting', 'gets',
  'say', 'says', 'said', 'saying', 'make', 'makes', 'made', 'making',
  'go', 'goes', 'went', 'going', 'gone',
  'take', 'takes', 'took', 'taking', 'taken',
  'come', 'comes', 'came', 'coming',
  'see', 'sees', 'saw', 'seeing', 'seen',
  'know', 'knows', 'knew', 'knowing', 'known',
  'think', 'thinks', 'thought', 'thinking',
  'want', 'wants', 'wanted', 'wanting',
  'give', 'gives', 'gave', 'giving', 'given',
  'use', 'uses', 'used', 'using',
  'find', 'finds', 'found', 'finding',
  'tell', 'tells', 'told', 'telling',
  'ask', 'asks', 'asked', 'asking',
  'seem', 'seems', 'seemed', 'seeming',
  'feel', 'feels', 'felt', 'feeling',
  'try', 'tries', 'tried', 'trying',
  'leave', 'leaves', 'left', 'leaving',
  'call', 'calls', 'called', 'calling',
  'keep', 'keeps', 'kept', 'keeping',
  'let', 'lets', 'letting',
  'begin', 'begins', 'began', 'beginning', 'begun',
  'show', 'shows', 'showed', 'showing', 'shown',
  'hear', 'hears', 'heard', 'hearing',
  'play', 'plays', 'played', 'playing',
  'run', 'runs', 'ran', 'running',
  'move', 'moves', 'moved', 'moving',
  'live', 'lives', 'lived', 'living',
  'believe', 'believes', 'believed', 'believing',
  'hold', 'holds', 'held', 'holding',
  'bring', 'brings', 'brought', 'bringing',
  'happen', 'happens', 'happened', 'happening',
  'write', 'writes', 'wrote', 'writing', 'written',
  'sit', 'sits', 'sat', 'sitting',
  'stand', 'stands', 'stood', 'standing',
  'lose', 'loses', 'lost', 'losing',
  'pay', 'pays', 'paid', 'paying',
  'meet', 'meets', 'met', 'meeting',
  'include', 'includes', 'included', 'including',
  'continue', 'continues', 'continued', 'continuing',
  'set', 'sets', 'setting',
  'learn', 'learns', 'learned', 'learning',
  'change', 'changes', 'changed', 'changing',
  'lead', 'leads', 'led', 'leading',
  'understand', 'understands', 'understood', 'understanding',
  'watch', 'watches', 'watched', 'watching',
  'follow', 'follows', 'followed', 'following',
  'stop', 'stops', 'stopped', 'stopping',
  'create', 'creates', 'created', 'creating',
  'speak', 'speaks', 'spoke', 'speaking', 'spoken',
  'read', 'reads', 'reading',
  'allow', 'allows', 'allowed', 'allowing',
  'add', 'adds', 'added', 'adding',
  'spend', 'spends', 'spent', 'spending',
  'grow', 'grows', 'grew', 'growing', 'grown',
  'open', 'opens', 'opened', 'opening',
  'walk', 'walks', 'walked', 'walking',
  'win', 'wins', 'won', 'winning',
  'offer', 'offers', 'offered', 'offering',
  'remember', 'remembers', 'remembered', 'remembering',
  'consider', 'considers', 'considered', 'considering',
  'appear', 'appears', 'appeared', 'appearing',
  'buy', 'buys', 'bought', 'buying',
  'wait', 'waits', 'waited', 'waiting',
  'serve', 'serves', 'served', 'serving',
  'die', 'dies', 'died', 'dying',
  'send', 'sends', 'sent', 'sending',
  'expect', 'expects', 'expected', 'expecting',
  'build', 'builds', 'built', 'building',
  'stay', 'stays', 'stayed', 'staying',
  'fall', 'falls', 'fell', 'falling', 'fallen',
  'cut', 'cuts', 'cutting',
  'reach', 'reaches', 'reached', 'reaching',
  'kill', 'kills', 'killed', 'killing',
  'remain', 'remains', 'remained', 'remaining',
  
  // Prepositions
  'in', 'of', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about',
  'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out',
  'against', 'during', 'without', 'before', 'under', 'around', 'among',
  'up', 'down', 'off', 'above', 'below', 'along', 'until', 'across', 'toward', 'towards',
  'upon', 'within', 'behind', 'beyond', 'near', 'beside', 'besides',
  
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'also', 'than', 'when', 'while', 'if', 'because', 'although',
  'unless', 'since', 'whether', 'though', 'whereas', 'whenever', 'wherever',
  
  // Adverbs
  'very', 'really', 'just', 'now', 'then', 'here', 'there', 'where',
  'how', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'any', 'only', 'same', 'so', 'too',
  'again', 'ever', 'never', 'always', 'often', 'sometimes', 'usually',
  'still', 'already', 'even', 'perhaps', 'maybe', 'probably',
  'almost', 'enough', 'quite', 'rather', 'somewhat', 'well',
  'however', 'therefore', 'thus', 'hence', 'moreover', 'furthermore',
  'otherwise', 'nevertheless', 'nonetheless', 'meanwhile', 'instead',
  
  // Determiners/Quantifiers
  'much', 'many', 'little', 'less', 'least', 'fewer', 'fewest',
  'several', 'certain', 'another', 'own',
  
  // Numbers (as words)
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third', 'last', 'next', 'once', 'twice',
  
  // Time words
  'today', 'yesterday', 'tomorrow', 'week', 'month', 'year', 'day', 'time',
  'morning', 'afternoon', 'evening', 'night', 'hour', 'minute',
  
  // Common nouns (too generic)
  'thing', 'things', 'something', 'anything', 'nothing', 'everything',
  'way', 'ways', 'part', 'parts', 'place', 'places', 'case', 'cases',
  'point', 'points', 'fact', 'facts', 'end', 'ends', 'lot', 'lots',
  'kind', 'kinds', 'sort', 'sorts', 'type', 'types', 'number', 'numbers',
  'group', 'groups', 'problem', 'problems', 'hand', 'hands',
  'home', 'house', 'room', 'side', 'area', 'line', 'word', 'words',
  'work', 'works', 'world', 'life', 'man', 'men', 'woman', 'women',
  'child', 'children', 'people', 'person', 'year', 'years',
  'percent', 'million', 'billion', 'according',
  
  // Question words
  'whose', 'whichever', 'whoever', 'whatever', 'whenever', 'wherever', 'however',
  
  // Contractions (without apostrophe)
  'dont', 'doesnt', 'didnt', 'wont', 'wouldnt', 'cant', 'couldnt',
  'shouldnt', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt',
  'thats', 'whats', 'whos', 'heres', 'theres', 'wheres',
  'im', 'youre', 'hes', 'shes', 'its', 'were', 'theyre',
  'ive', 'youve', 'weve', 'theyve',
  'ill', 'youll', 'hell', 'shell', 'itll', 'well', 'theyll',
  'id', 'youd', 'hed', 'shed', 'wed', 'theyd',
  
  // News/article-specific
  'said', 'says', 'according', 'reported', 'reports', 'news', 'article',
  'story', 'source', 'sources', 'official', 'officials', 'statement',
  'spokesman', 'spokeswoman', 'spokesperson', 'told', 'added', 'noted',
  'reuters', 'associated', 'press', 'ap', 'afp', 'update', 'updated',
  'breaking', 'exclusive', 'editor', 'editors', 'read', 'more',
  'click', 'share', 'comment', 'comments', 'like', 'subscribe',
  'newsletter', 'follow', 'contact', 'copyright', 'rights', 'reserved'
]);

/**
 * Check if a word is a stopword
 * @param {string} word - Word to check (will be lowercased)
 * @returns {boolean} True if stopword
 */
function isStopword(word) {
  return STOPWORDS.has(word.toLowerCase());
}

/**
 * Filter out stopwords from an array of words
 * @param {string[]} words - Array of words
 * @returns {string[]} Words without stopwords
 */
function removeStopwords(words) {
  return words.filter(word => !isStopword(word));
}

/**
 * Get the full stopword set
 * @returns {Set<string>} Stopword set
 */
function getStopwords() {
  return STOPWORDS;
}

module.exports = {
  STOPWORDS,
  isStopword,
  removeStopwords,
  getStopwords
};
