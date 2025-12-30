'use strict';

const { 
  PubSub, 
  PubSubAsyncIterator, 
  TOPICS, 
  createSubscriptionResolvers,
  connectToEventBroadcaster,
  filterAsyncIterator
} = require('../../../src/api/graphql/subscriptions');

describe('PubSub', () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new PubSub();
  });

  describe('constructor', () => {
    it('should create PubSub instance', () => {
      expect(pubsub).toBeDefined();
      expect(pubsub.emitter).toBeDefined();
      expect(pubsub.subscriptions).toBeInstanceOf(Map);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to a topic', () => {
      const callback = jest.fn();
      const subscription = pubsub.subscribe('test-topic', callback);

      expect(subscription).toBeDefined();
      expect(typeof subscription).toBe('number');
    });

    it('should return unique subscription IDs', () => {
      const sub1 = pubsub.subscribe('topic-1', jest.fn());
      const sub2 = pubsub.subscribe('topic-2', jest.fn());
      const sub3 = pubsub.subscribe('topic-1', jest.fn());

      expect(sub1).not.toBe(sub2);
      expect(sub1).not.toBe(sub3);
      expect(sub2).not.toBe(sub3);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from a topic', () => {
      const callback = jest.fn();
      const subId = pubsub.subscribe('test-topic', callback);

      pubsub.unsubscribe(subId);
      pubsub.publish('test-topic', { data: 'test' });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should publish to all subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      pubsub.subscribe('test-topic', callback1);
      pubsub.subscribe('test-topic', callback2);

      pubsub.publish('test-topic', { data: 'test' });

      expect(callback1).toHaveBeenCalledWith({ data: 'test' });
      expect(callback2).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should only publish to matching topic', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      pubsub.subscribe('topic-1', callback1);
      pubsub.subscribe('topic-2', callback2);

      pubsub.publish('topic-1', { data: 'test' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should handle no subscribers gracefully', () => {
      expect(() => {
        pubsub.publish('non-existent-topic', { data: 'test' });
      }).not.toThrow();
    });
  });

  describe('asyncIterator', () => {
    it('should create async iterator for a topic', () => {
      const iterator = pubsub.asyncIterator('test-topic');

      expect(iterator).toBeDefined();
      expect(iterator[Symbol.asyncIterator]).toBeDefined();
    });

    it('should create async iterator for multiple topics', () => {
      const iterator = pubsub.asyncIterator(['topic-1', 'topic-2']);

      expect(iterator).toBeDefined();
    });
  });
});

describe('PubSubAsyncIterator', () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new PubSub();
  });

  describe('next', () => {
    it('should receive published messages', async () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);

      // Publish after a short delay
      setTimeout(() => {
        pubsub.publish('test-topic', { message: 'Hello' });
      }, 10);

      const result = await iterator.next();

      expect(result.done).toBe(false);
      expect(result.value).toEqual({ message: 'Hello' });
    });

    it('should queue multiple messages', async () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);

      setTimeout(() => {
        pubsub.publish('test-topic', { id: 1 });
        pubsub.publish('test-topic', { id: 2 });
        pubsub.publish('test-topic', { id: 3 });
      }, 10);

      const result1 = await iterator.next();
      const result2 = await iterator.next();
      const result3 = await iterator.next();

      expect(result1.value.id).toBe(1);
      expect(result2.value.id).toBe(2);
      expect(result3.value.id).toBe(3);
    });
  });

  describe('return', () => {
    it('should complete the iterator', async () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);

      const result = await iterator.return();

      expect(result.done).toBe(true);
      expect(result.value).toBeUndefined();
    });

    it('should unsubscribe from pubsub', async () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);

      await iterator.return();
      
      // pushQueue should be empty after return
      expect(iterator.pushQueue).toHaveLength(0);
    });
  });

  describe('throw', () => {
    it('should reject with error', async () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);
      const error = new Error('Test error');

      await expect(iterator.throw(error)).rejects.toThrow('Test error');
    });
  });

  describe('Symbol.asyncIterator', () => {
    it('should return self', () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);

      expect(iterator[Symbol.asyncIterator]()).toBe(iterator);
    });
  });

  describe('for await...of', () => {
    it('should work with for await...of', async () => {
      const iterator = new PubSubAsyncIterator(pubsub, ['test-topic']);
      const received = [];

      setTimeout(() => {
        pubsub.publish('test-topic', { id: 1 });
        pubsub.publish('test-topic', { id: 2 });
        // Complete the iterator
        setTimeout(() => iterator.return(), 50);
      }, 10);

      for await (const msg of iterator) {
        received.push(msg);
        if (received.length >= 2) break;
      }

      expect(received.length).toBe(2);
    });
  });
});

describe('TOPICS', () => {
  it('should define article topics', () => {
    expect(TOPICS.ARTICLE_ADDED).toBeDefined();
    expect(TOPICS.ARTICLE_ADDED).toBe('ARTICLE_ADDED');
  });

  it('should define alert topics', () => {
    expect(TOPICS.ALERT_TRIGGERED).toBeDefined();
    expect(TOPICS.ALERT_TRIGGERED).toBe('ALERT_TRIGGERED');
  });

  it('should define breaking news topic', () => {
    expect(TOPICS.BREAKING_NEWS).toBeDefined();
    expect(TOPICS.BREAKING_NEWS).toBe('BREAKING_NEWS');
  });

  it('should define story topics', () => {
    expect(TOPICS.STORY_UPDATED).toBeDefined();
    expect(TOPICS.STORY_UPDATED).toBe('STORY_UPDATED');
  });

  it('should have unique topic names', () => {
    const values = Object.values(TOPICS);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });
});

describe('createSubscriptionResolvers', () => {
  let pubsub;
  let resolvers;

  beforeEach(() => {
    pubsub = new PubSub();
    resolvers = createSubscriptionResolvers(pubsub);
  });

  it('should create subscription resolvers', () => {
    expect(resolvers).toBeDefined();
    expect(resolvers.Subscription).toBeDefined();
  });

  describe('articleAdded', () => {
    it('should subscribe to article added events', () => {
      const subscription = resolvers.Subscription.articleAdded;

      expect(subscription).toBeDefined();
      expect(subscription.subscribe).toBeDefined();
    });

    it('should return async iterator', () => {
      const iterator = resolvers.Subscription.articleAdded.subscribe(null, {});

      expect(iterator).toBeDefined();
      expect(iterator[Symbol.asyncIterator]).toBeDefined();
    });

    it('should have resolve function', () => {
      const resolve = resolvers.Subscription.articleAdded.resolve;

      expect(resolve).toBeDefined();
      const payload = { id: 1, title: 'Test' };
      const result = resolve(payload);
      expect(result).toEqual(payload);
    });

    it('should filter by topic if provided', () => {
      const iterator = resolvers.Subscription.articleAdded.subscribe(null, { 
        filter: { topic: 'tech' } 
      });

      expect(iterator).toBeDefined();
      expect(iterator[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe('alertTriggered', () => {
    it('should subscribe to alert triggered events', () => {
      const subscription = resolvers.Subscription.alertTriggered;

      expect(subscription).toBeDefined();
      expect(subscription.subscribe).toBeDefined();
    });

    it('should require authentication', () => {
      const context = { user: null };

      expect(() => {
        resolvers.Subscription.alertTriggered.subscribe(null, {}, context);
      }).toThrow('Authentication required');
    });

    it('should return iterator when authenticated', () => {
      const context = { user: { id: 1 } };
      const iterator = resolvers.Subscription.alertTriggered.subscribe(null, {}, context);

      expect(iterator).toBeDefined();
      expect(iterator[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe('breakingNews', () => {
    it('should subscribe to breaking news events', () => {
      const subscription = resolvers.Subscription.breakingNews;

      expect(subscription).toBeDefined();
      expect(subscription.subscribe).toBeDefined();
    });

    it('should not require authentication', () => {
      const context = { user: null };
      const iterator = resolvers.Subscription.breakingNews.subscribe(null, {}, context);

      expect(iterator).toBeDefined();
    });
  });

  describe('storyUpdated', () => {
    it('should subscribe to story updated events', () => {
      const subscription = resolvers.Subscription.storyUpdated;

      expect(subscription).toBeDefined();
      expect(subscription.subscribe).toBeDefined();
    });

    it('should filter by story ID if provided', () => {
      const iterator = resolvers.Subscription.storyUpdated.subscribe(null, { storyId: 1 }, {});

      expect(iterator).toBeDefined();
    });

    it('should return all stories if no filter', () => {
      const iterator = resolvers.Subscription.storyUpdated.subscribe(null, {}, {});

      expect(iterator).toBeDefined();
    });
  });
});

describe('filterAsyncIterator', () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new PubSub();
  });

  it('should filter messages based on filter function', async () => {
    const iterator = pubsub.asyncIterator('test-topic');
    const filtered = filterAsyncIterator(iterator, (value) => value.id > 1);

    setTimeout(() => {
      pubsub.publish('test-topic', { id: 1 });
      pubsub.publish('test-topic', { id: 2 });
      pubsub.publish('test-topic', { id: 3 });
    }, 10);

    const result1 = await filtered.next();
    const result2 = await filtered.next();

    expect(result1.value.id).toBe(2);
    expect(result2.value.id).toBe(3);
  });

  it('should implement async iterator protocol', () => {
    const iterator = pubsub.asyncIterator('test-topic');
    const filtered = filterAsyncIterator(iterator, () => true);

    expect(filtered[Symbol.asyncIterator]()).toBe(filtered);
  });
});

describe('connectToEventBroadcaster', () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new PubSub();
  });

  it('should handle null event broadcaster', () => {
    expect(() => {
      connectToEventBroadcaster(pubsub, null);
    }).not.toThrow();
  });

  it('should connect to event broadcaster', () => {
    const mockBroadcaster = {
      on: jest.fn()
    };

    connectToEventBroadcaster(pubsub, mockBroadcaster);

    // Should register handlers for mapped events
    expect(mockBroadcaster.on).toHaveBeenCalled();
  });

  it('should map article:new to ARTICLE_ADDED topic', () => {
    const publishSpy = jest.spyOn(pubsub, 'publish');
    const mockBroadcaster = {
      on: jest.fn((event, callback) => {
        if (event === 'article:new') {
          callback({ id: 1, title: 'New Article' });
        }
      })
    };

    connectToEventBroadcaster(pubsub, mockBroadcaster);

    expect(publishSpy).toHaveBeenCalledWith(
      TOPICS.ARTICLE_ADDED,
      { id: 1, title: 'New Article' }
    );
  });
});
