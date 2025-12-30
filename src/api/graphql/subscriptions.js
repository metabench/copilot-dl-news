'use strict';

/**
 * GraphQL Subscriptions with EventEmitter
 * @module api/graphql/subscriptions
 */

const EventEmitter = require('events');

/**
 * PubSub implementation using EventEmitter
 */
class PubSub {
  constructor() {
    this.emitter = new EventEmitter();
    this.subscriptions = new Map();
    this.subId = 0;
  }

  /**
   * Publish an event
   * @param {string} topic - Topic name
   * @param {*} payload - Event payload
   */
  publish(topic, payload) {
    this.emitter.emit(topic, payload);
  }

  /**
   * Subscribe to a topic
   * @param {string} topic - Topic name
   * @param {Function} callback - Callback function
   * @returns {number} Subscription ID
   */
  subscribe(topic, callback) {
    const id = ++this.subId;
    this.emitter.on(topic, callback);
    this.subscriptions.set(id, { topic, callback });
    return id;
  }

  /**
   * Unsubscribe from a topic
   * @param {number} subId - Subscription ID
   */
  unsubscribe(subId) {
    const sub = this.subscriptions.get(subId);
    if (sub) {
      this.emitter.off(sub.topic, sub.callback);
      this.subscriptions.delete(subId);
    }
  }

  /**
   * Create an async iterator for a topic
   * @param {string|string[]} topics - Topic name(s)
   * @returns {AsyncIterator} Async iterator
   */
  asyncIterator(topics) {
    const topicList = Array.isArray(topics) ? topics : [topics];
    return new PubSubAsyncIterator(this, topicList);
  }
}

/**
 * Async iterator for PubSub
 */
class PubSubAsyncIterator {
  constructor(pubsub, topics) {
    this.pubsub = pubsub;
    this.topics = topics;
    this.pullQueue = [];
    this.pushQueue = [];
    this.running = true;
    this.subscriptionIds = [];
    
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    for (const topic of this.topics) {
      const id = this.pubsub.subscribe(topic, (payload) => {
        this.pushValue({ value: payload, done: false });
      });
      this.subscriptionIds.push(id);
    }
  }

  pushValue(value) {
    if (this.pullQueue.length > 0) {
      const resolver = this.pullQueue.shift();
      resolver(value);
    } else {
      this.pushQueue.push(value);
    }
  }

  pullValue() {
    return new Promise((resolve) => {
      if (this.pushQueue.length > 0) {
        resolve(this.pushQueue.shift());
      } else {
        this.pullQueue.push(resolve);
      }
    });
  }

  async next() {
    if (!this.running) {
      return { value: undefined, done: true };
    }
    return this.pullValue();
  }

  async return() {
    this.running = false;
    for (const id of this.subscriptionIds) {
      this.pubsub.unsubscribe(id);
    }
    this.pullQueue.forEach(resolve => resolve({ value: undefined, done: true }));
    return { value: undefined, done: true };
  }

  async throw(error) {
    await this.return();
    throw error;
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

/**
 * Subscription topic names
 */
const TOPICS = {
  ARTICLE_ADDED: 'ARTICLE_ADDED',
  ALERT_TRIGGERED: 'ALERT_TRIGGERED',
  BREAKING_NEWS: 'BREAKING_NEWS',
  STORY_UPDATED: 'STORY_UPDATED'
};

/**
 * Create subscription resolvers
 * @param {PubSub} pubsub - PubSub instance
 * @returns {Object} Subscription resolvers
 */
function createSubscriptionResolvers(pubsub) {
  return {
    Subscription: {
      articleAdded: {
        subscribe: (_, { filter }) => {
          const iterator = pubsub.asyncIterator(TOPICS.ARTICLE_ADDED);
          
          // If filter is provided, wrap the iterator to filter results
          if (filter) {
            return filterAsyncIterator(iterator, (article) => {
              if (filter.topic && (!article.topics || !article.topics.includes(filter.topic))) {
                return false;
              }
              if (filter.source && article.source !== filter.source) {
                return false;
              }
              return true;
            });
          }
          
          return iterator;
        },
        resolve: (payload) => payload
      },

      alertTriggered: {
        subscribe: (_, __, context) => {
          if (!context.user) {
            throw new Error('Authentication required');
          }
          
          const iterator = pubsub.asyncIterator(TOPICS.ALERT_TRIGGERED);
          
          // Filter to only this user's alerts
          return filterAsyncIterator(iterator, (trigger) => {
            return trigger.userId === context.user.id;
          });
        },
        resolve: (payload) => payload
      },

      breakingNews: {
        subscribe: () => pubsub.asyncIterator(TOPICS.BREAKING_NEWS),
        resolve: (payload) => payload
      },

      storyUpdated: {
        subscribe: (_, { storyId }) => {
          const iterator = pubsub.asyncIterator(TOPICS.STORY_UPDATED);
          
          if (storyId) {
            return filterAsyncIterator(iterator, (story) => {
              return String(story.id) === String(storyId);
            });
          }
          
          return iterator;
        },
        resolve: (payload) => payload
      }
    }
  };
}

/**
 * Filter an async iterator
 * @param {AsyncIterator} iterator - Source iterator
 * @param {Function} filterFn - Filter function
 * @returns {AsyncIterator} Filtered iterator
 */
function filterAsyncIterator(iterator, filterFn) {
  return {
    async next() {
      while (true) {
        const result = await iterator.next();
        if (result.done) return result;
        if (filterFn(result.value)) return result;
      }
    },
    return: iterator.return?.bind(iterator),
    throw: iterator.throw?.bind(iterator),
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}

/**
 * Connect PubSub to EventBroadcaster
 * @param {PubSub} pubsub - PubSub instance
 * @param {Object} eventBroadcaster - EventBroadcaster instance
 */
function connectToEventBroadcaster(pubsub, eventBroadcaster) {
  if (!eventBroadcaster) return;

  // Map EventBroadcaster events to PubSub topics
  const eventMappings = {
    'article:new': TOPICS.ARTICLE_ADDED,
    'article:added': TOPICS.ARTICLE_ADDED,
    'alert:triggered': TOPICS.ALERT_TRIGGERED,
    'breaking_news': TOPICS.BREAKING_NEWS,
    'story:updated': TOPICS.STORY_UPDATED
  };

  for (const [event, topic] of Object.entries(eventMappings)) {
    if (eventBroadcaster.on) {
      eventBroadcaster.on(event, (data) => {
        pubsub.publish(topic, data);
      });
    }
  }
}

module.exports = {
  PubSub,
  PubSubAsyncIterator,
  TOPICS,
  createSubscriptionResolvers,
  connectToEventBroadcaster,
  filterAsyncIterator
};
