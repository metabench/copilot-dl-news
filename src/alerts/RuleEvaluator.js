'use strict';

/**
 * RuleEvaluator - Parse and evaluate alert rule conditions against articles
 * 
 * Supports condition types:
 * - keyword_match: Check if keywords appear in article text/title
 * - entity_mention: Check if specific entities are mentioned
 * - category_match: Check if article matches a category
 * - sentiment_threshold: Check sentiment score with operators
 * - source_match: Check if article is from a specific source
 * 
 * Operators: AND, OR, NOT - supports nested conditions
 * 
 * @module RuleEvaluator
 */

/**
 * Condition types
 */
const CONDITION_TYPES = {
  KEYWORD_MATCH: 'keyword_match',
  ENTITY_MENTION: 'entity_mention',
  CATEGORY_MATCH: 'category_match',
  SENTIMENT_THRESHOLD: 'sentiment_threshold',
  SOURCE_MATCH: 'source_match',
  TOPIC_MATCH: 'topic_match',
  BREAKING_NEWS: 'breaking_news'
};

/**
 * Comparison operators for numeric conditions
 */
const OPERATORS = {
  EQ: '==',
  NE: '!=',
  LT: '<',
  GT: '>',
  LTE: '<=',
  GTE: '>='
};

/**
 * Logical operators
 */
const LOGICAL = {
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT'
};

/**
 * RuleEvaluator class
 */
class RuleEvaluator {
  /**
   * Create a RuleEvaluator
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.entityRecognizer] - EntityRecognizer for extracting entities
   * @param {Object} [options.topicModeler] - TopicModeler for category/topic matching
   * @param {Object} [options.sentimentAnalyzer] - SentimentAnalyzer for sentiment checks
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.entityRecognizer = options.entityRecognizer || null;
    this.topicModeler = options.topicModeler || null;
    this.sentimentAnalyzer = options.sentimentAnalyzer || null;
    this.logger = options.logger || console;
  }

  /**
   * Evaluate a rule's conditions against an article
   * 
   * @param {Object} rule - Alert rule with conditions array
   * @param {Object} article - Article to evaluate
   * @param {Object} [context] - Pre-computed analysis context
   * @returns {{matches: boolean, matchedConditions: Array, reason: string}}
   */
  evaluate(rule, article, context = {}) {
    if (!rule || !rule.conditions) {
      return { matches: false, matchedConditions: [], reason: 'Invalid rule' };
    }

    const conditions = Array.isArray(rule.conditions) 
      ? rule.conditions 
      : [rule.conditions];

    if (conditions.length === 0) {
      return { matches: false, matchedConditions: [], reason: 'No conditions' };
    }

    // Build evaluation context from article and pre-computed data
    const evalContext = this._buildContext(article, context);

    // Evaluate the condition tree
    const { result, matched } = this._evaluateConditions(conditions, evalContext);

    return {
      matches: result,
      matchedConditions: matched,
      reason: result 
        ? `Matched ${matched.length} condition(s): ${matched.map(c => c.type).join(', ')}`
        : 'No conditions matched'
    };
  }

  /**
   * Build evaluation context from article and pre-computed data
   * @private
   */
  _buildContext(article, preComputed = {}) {
    const context = {
      // Article fields
      title: (article.title || '').toLowerCase(),
      body: (article.body || article.content || '').toLowerCase(),
      host: article.host || '',
      url: article.url || '',
      publishedAt: article.publishedAt || article.published_at || article.createdAt,
      
      // Pre-computed analysis
      entities: preComputed.entities || [],
      category: preComputed.category || article.category || null,
      topics: preComputed.topics || [],
      sentiment: preComputed.sentiment || null,
      isBreakingNews: preComputed.isBreakingNews || false,
      
      // Full text for searching
      fullText: ''
    };

    context.fullText = `${context.title} ${context.body}`.toLowerCase();

    // Extract entities on-demand if we have a recognizer and no pre-computed entities
    if (this.entityRecognizer && context.entities.length === 0 && context.body) {
      try {
        context.entities = this.entityRecognizer.recognize(article.body || article.content || '');
      } catch (err) {
        this.logger.warn('[RuleEvaluator] Entity extraction failed:', err.message);
      }
    }

    return context;
  }

  /**
   * Evaluate a condition tree
   * @private
   * @returns {{result: boolean, matched: Array}}
   */
  _evaluateConditions(conditions, context) {
    const matched = [];
    
    // Simple array of conditions (implicit AND)
    if (conditions.every(c => typeof c === 'object' && c.type)) {
      let allMatch = true;
      
      for (const condition of conditions) {
        const { result, conditionInfo } = this._evaluateSingleCondition(condition, context);
        if (result) {
          matched.push(conditionInfo);
        } else {
          allMatch = false;
        }
      }
      
      return { result: allMatch, matched };
    }

    // Complex nested conditions with operators
    // Format: [[cond1, 'AND', cond2], 'OR', cond3]
    return this._evaluateNestedConditions(conditions, context, matched);
  }

  /**
   * Evaluate nested conditions with logical operators
   * @private
   */
  _evaluateNestedConditions(conditions, context, matched = []) {
    if (!Array.isArray(conditions)) {
      // Single condition object with explicit logic
      if (typeof conditions === 'object' && conditions.logic) {
        return this._evaluateLogicBlock(conditions, context, matched);
      }
      
      // Single condition object without logic (terminal condition)
      if (typeof conditions === 'object' && conditions.type) {
        const { result, conditionInfo } = this._evaluateSingleCondition(conditions, context);
        if (result) matched.push(conditionInfo);
        return { result, matched };
      }
      return { result: false, matched };
    }

    // Check for logical operator pattern: [left, 'OPERATOR', right]
    if (conditions.length === 3 && typeof conditions[1] === 'string') {
      const operator = conditions[1].toUpperCase();
      
      if (operator === LOGICAL.AND) {
        const left = this._evaluateNestedConditions(conditions[0], context, matched);
        if (!left.result) return { result: false, matched };
        
        const right = this._evaluateNestedConditions(conditions[2], context, matched);
        return { result: right.result, matched };
      }
      
      if (operator === LOGICAL.OR) {
        const left = this._evaluateNestedConditions(conditions[0], context, matched);
        if (left.result) return { result: true, matched };
        
        return this._evaluateNestedConditions(conditions[2], context, matched);
      }
    }

    // NOT operator: ['NOT', condition]
    if (conditions.length === 2 && conditions[0] === LOGICAL.NOT) {
      const inner = this._evaluateNestedConditions(conditions[1], context, []);
      return { result: !inner.result, matched: [] };
    }

    // Array of conditions (implicit AND)
    let allMatch = true;
    for (const cond of conditions) {
      const { result } = this._evaluateNestedConditions(cond, context, matched);
      if (!result) {
        allMatch = false;
      }
    }
    
    return { result: allMatch, matched };
  }

  /**
   * Evaluate a logic block: {logic: 'AND'/'OR'/'NOT', conditions: [...]}
   * @private
   */
  _evaluateLogicBlock(block, context, matched = []) {
    const logic = (block.logic || 'AND').toUpperCase();
    const conditions = block.conditions || [];
    
    if (conditions.length === 0) {
      return { result: false, matched };
    }

    if (logic === LOGICAL.AND) {
      for (const cond of conditions) {
        const { result, conditionInfo } = typeof cond.logic !== 'undefined'
          ? this._evaluateLogicBlock(cond, context, matched)
          : (cond.type
              ? this._evaluateSingleCondition(cond, context)
              : this._evaluateNestedConditions(cond, context, matched));
        
        if (!result) {
          return { result: false, matched };
        }
        if (conditionInfo) matched.push(conditionInfo);
      }
      return { result: true, matched };
    }

    if (logic === LOGICAL.OR) {
      for (const cond of conditions) {
        const { result, conditionInfo } = typeof cond.logic !== 'undefined'
          ? this._evaluateLogicBlock(cond, context, matched)
          : (cond.type
              ? this._evaluateSingleCondition(cond, context)
              : this._evaluateNestedConditions(cond, context, matched));
        
        if (result) {
          if (conditionInfo) matched.push(conditionInfo);
          return { result: true, matched };
        }
      }
      return { result: false, matched };
    }

    if (logic === LOGICAL.NOT) {
      // NOT should have exactly one condition
      const cond = conditions[0];
      const { result } = typeof cond.logic !== 'undefined'
        ? this._evaluateLogicBlock(cond, context, [])
        : (cond.type
            ? this._evaluateSingleCondition(cond, context)
            : this._evaluateNestedConditions(cond, context, []));
      
      return { result: !result, matched: [] };
    }

    // Unknown logic, treat as AND
    return this._evaluateLogicBlock({ logic: 'AND', conditions }, context, matched);
  }

  /**
   * Evaluate a single condition
   * @private
   * @returns {{result: boolean, conditionInfo: Object}}
   */
  _evaluateSingleCondition(condition, context) {
    const conditionInfo = {
      type: condition.type,
      value: condition.value,
      matched: false
    };

    let result = false;

    switch (condition.type) {
      case CONDITION_TYPES.KEYWORD_MATCH:
        result = this._evaluateKeyword(condition, context);
        break;

      case CONDITION_TYPES.ENTITY_MENTION:
        result = this._evaluateEntity(condition, context);
        break;

      case CONDITION_TYPES.CATEGORY_MATCH:
        result = this._evaluateCategory(condition, context);
        break;

      case CONDITION_TYPES.SENTIMENT_THRESHOLD:
        result = this._evaluateSentiment(condition, context);
        break;

      case CONDITION_TYPES.SOURCE_MATCH:
        result = this._evaluateSource(condition, context);
        break;

      case CONDITION_TYPES.TOPIC_MATCH:
        result = this._evaluateTopic(condition, context);
        break;

      case CONDITION_TYPES.BREAKING_NEWS:
        result = this._evaluateBreakingNews(condition, context);
        break;

      default:
        this.logger.warn(`[RuleEvaluator] Unknown condition type: ${condition.type}`);
        result = false;
    }

    conditionInfo.matched = result;
    return { result, conditionInfo };
  }

  /**
   * Evaluate keyword match condition
   * @private
   */
  _evaluateKeyword(condition, context) {
    // Support both 'keywords' and 'value' field names
    const rawKeywords = condition.keywords || condition.value;
    if (!rawKeywords) {
      return false;
    }
    
    const keywords = Array.isArray(rawKeywords) 
      ? rawKeywords.filter(k => k != null)
      : [rawKeywords];
    
    if (keywords.length === 0) {
      return false;
    }
    
    const fields = condition.fields || ['title', 'body'];
    const matchAll = condition.matchAll === true;

    let searchText = '';
    for (const field of fields) {
      if (field === 'title') searchText += ` ${context.title || ''}`;
      if (field === 'body') searchText += ` ${context.body || ''}`;
    }
    searchText = searchText.toLowerCase();

    if (matchAll) {
      return keywords.every(kw => searchText.includes(String(kw).toLowerCase()));
    }
    
    return keywords.some(kw => searchText.includes(String(kw).toLowerCase()));
  }

  /**
   * Evaluate entity mention condition
   * @private
   */
  _evaluateEntity(condition, context) {
    // Support both 'entityName' and 'value' field names
    const targetEntity = (condition.entityName || condition.value || '').toLowerCase();
    const targetType = condition.entityType || null;

    if (!context.entities || context.entities.length === 0) {
      // Fallback: search in text if we have a target entity
      if (targetEntity) {
        return context.fullText.includes(targetEntity);
      }
      return false;
    }

    return context.entities.some(entity => {
      // If no target name, match by type only
      const nameMatch = !targetEntity || entity.text.toLowerCase().includes(targetEntity);
      const typeMatch = !targetType || entity.type === targetType;
      return nameMatch && typeMatch;
    });
  }

  /**
   * Evaluate category match condition
   * @private
   */
  _evaluateCategory(condition, context) {
    // Support both 'categories' array and 'value' string
    const rawCategories = condition.categories || condition.value;
    if (!rawCategories) {
      return false;
    }
    
    const targetCategories = (Array.isArray(rawCategories) 
      ? rawCategories 
      : [rawCategories])
      .filter(c => c != null)
      .map(c => String(c).toLowerCase());
    
    if (targetCategories.length === 0) {
      return false;
    }
    
    if (!context.category) {
      // Try to classify if we have a topic modeler
      if (this.topicModeler && context.body) {
        try {
          const topics = this.topicModeler.classify(`${context.title} ${context.body}`);
          if (topics.length > 0) {
            return topics.some(t => targetCategories.includes(t.topicName.toLowerCase()));
          }
        } catch (err) {
          this.logger.warn('[RuleEvaluator] Topic classification failed:', err.message);
        }
      }
      return false;
    }

    return targetCategories.includes(context.category.toLowerCase());
  }

  /**
   * Evaluate sentiment threshold condition
   * @private
   */
  _evaluateSentiment(condition, context) {
    const operator = condition.operator || '<';
    // Support both 'threshold' and 'value' field names
    const threshold = parseFloat(condition.threshold ?? condition.value);

    if (isNaN(threshold)) return false;

    let sentimentScore = null;
    
    if (context.sentiment && typeof context.sentiment.score === 'number') {
      sentimentScore = context.sentiment.score;
    } else if (context.sentiment && typeof context.sentiment.overallScore === 'number') {
      sentimentScore = context.sentiment.overallScore;
    } else if (this.sentimentAnalyzer && context.body) {
      // Analyze on-demand
      try {
        const result = this.sentimentAnalyzer.analyze(context.body);
        sentimentScore = result.score || result.overallScore;
      } catch (err) {
        this.logger.warn('[RuleEvaluator] Sentiment analysis failed:', err.message);
        return false;
      }
    }

    if (sentimentScore === null) return false;

    return this._compareNumeric(sentimentScore, operator, threshold);
  }

  /**
   * Evaluate source match condition
   * @private
   */
  _evaluateSource(condition, context) {
    // Support both 'sources' array and 'value' string
    const rawSources = condition.sources || condition.value;
    if (!rawSources) {
      return false;
    }
    
    const targetSources = (Array.isArray(rawSources) 
      ? rawSources 
      : [rawSources])
      .filter(s => s != null)
      .map(s => String(s).toLowerCase());
    
    if (targetSources.length === 0) {
      return false;
    }
    
    const host = (context.host || '').toLowerCase();
    
    // Support partial match (e.g., 'nytimes' matches 'nytimes.com')
    return targetSources.some(source => 
      host.includes(source) || source.includes(host)
    );
  }

  /**
   * Evaluate topic match condition
   * @private
   */
  _evaluateTopic(condition, context) {
    const targetTopic = (condition.value || '').toLowerCase();
    
    if (context.topics && context.topics.length > 0) {
      return context.topics.some(t => 
        (t.topicName || t.name || '').toLowerCase() === targetTopic ||
        t.topicId === condition.topicId
      );
    }

    return false;
  }

  /**
   * Evaluate breaking news condition
   * Matches if isBreakingNews flag is set OR title contains breaking keywords
   * @private
   */
  _evaluateBreakingNews(condition, context) {
    // Check explicit flag
    if (context.isBreakingNews === true) {
      return true;
    }

    // Check for breaking keywords in title/body
    const BREAKING_KEYWORDS = [
      'breaking',
      'breaking news',
      'just in',
      'developing',
      'alert',
      'urgent',
      'live updates',
      'happening now'
    ];

    const searchText = context.fullText || `${context.title || ''} ${context.body || ''}`.toLowerCase();
    
    return BREAKING_KEYWORDS.some(kw => searchText.includes(kw));
  }

  /**
   * Compare numeric values with operator
   * @private
   */
  _compareNumeric(value, operator, threshold) {
    switch (operator) {
      case OPERATORS.EQ:
      case '=':
        return value === threshold;
      case OPERATORS.NE:
        return value !== threshold;
      case OPERATORS.LT:
        return value < threshold;
      case OPERATORS.GT:
        return value > threshold;
      case OPERATORS.LTE:
        return value <= threshold;
      case OPERATORS.GTE:
        return value >= threshold;
      default:
        return false;
    }
  }

  /**
   * Validate a rule's conditions structure
   * 
   * @param {Object} rule - Rule to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateRule(rule) {
    const errors = [];

    if (!rule) {
      errors.push('Rule is required');
      return { valid: false, errors };
    }

    if (!rule.conditions) {
      errors.push('Rule must have conditions');
      return { valid: false, errors };
    }

    const conditions = Array.isArray(rule.conditions) 
      ? rule.conditions 
      : [rule.conditions];

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      
      if (typeof cond !== 'object') {
        // Skip operators
        if (typeof cond === 'string' && Object.values(LOGICAL).includes(cond.toUpperCase())) {
          continue;
        }
        // Skip nested arrays
        if (Array.isArray(cond)) {
          continue;
        }
        errors.push(`Condition ${i}: Invalid format`);
        continue;
      }

      // Handle logic blocks: {logic: 'AND', conditions: [...]}
      if (cond.logic) {
        if (!cond.conditions || !Array.isArray(cond.conditions) || cond.conditions.length === 0) {
          errors.push(`Condition ${i}: Logic block must have non-empty conditions array`);
        } else {
          // Recursively validate nested conditions
          const nested = this.validateRule({ conditions: cond.conditions });
          errors.push(...nested.errors);
        }
        continue;
      }

      if (!cond.type) {
        errors.push(`Condition ${i}: Missing 'type' field`);
        continue;
      }

      if (!Object.values(CONDITION_TYPES).includes(cond.type)) {
        errors.push(`Condition ${i}: Unknown condition type '${cond.type}'`);
        continue;
      }

      // Type-specific validation
      if (cond.type === CONDITION_TYPES.SENTIMENT_THRESHOLD) {
        if (cond.operator && !Object.values(OPERATORS).includes(cond.operator)) {
          errors.push(`Condition ${i}: Invalid operator '${cond.operator}'`);
        }
        const threshold = cond.threshold ?? cond.value;
        if (threshold !== undefined && isNaN(parseFloat(threshold))) {
          errors.push(`Condition ${i}: Sentiment threshold must be a number`);
        }
      }

      if (cond.type === CONDITION_TYPES.KEYWORD_MATCH) {
        const keywords = cond.keywords || cond.value;
        if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
          errors.push(`Condition ${i}: keyword_match requires keywords array or value`);
        }
      }

      if (cond.type === CONDITION_TYPES.CATEGORY_MATCH) {
        const categories = cond.categories || cond.value;
        if (!categories || (Array.isArray(categories) && categories.length === 0)) {
          errors.push(`Condition ${i}: category_match requires categories array or value`);
        }
      }

      if (cond.type === CONDITION_TYPES.SOURCE_MATCH) {
        const sources = cond.sources || cond.value;
        if (!sources || (Array.isArray(sources) && sources.length === 0)) {
          errors.push(`Condition ${i}: source_match requires sources array or value`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available condition types
   * 
   * @returns {Object}
   */
  static getConditionTypes() {
    return { ...CONDITION_TYPES };
  }

  /**
   * Get available operators
   * 
   * @returns {Object}
   */
  static getOperators() {
    return { ...OPERATORS };
  }

  /**
   * Get available logical operators
   * 
   * @returns {Object}
   */
  static getLogicalOperators() {
    return { ...LOGICAL };
  }
}

module.exports = {
  RuleEvaluator,
  CONDITION_TYPES,
  OPERATORS,
  LOGICAL
};
