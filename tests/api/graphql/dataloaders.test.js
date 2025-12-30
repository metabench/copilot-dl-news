'use strict';

const { DataLoader, createLoaders, createSavedArticleLoader } = require('../../../src/api/graphql/dataloaders');

describe('DataLoader', () => {
  describe('constructor', () => {
    it('should create a DataLoader with batch function', () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);
      
      expect(loader).toBeDefined();
      expect(loader.batchFn).toBe(batchFn);
    });

    it('should accept options with cache enabled by default', () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn, {});
      
      expect(loader).toBeDefined();
      expect(loader.cache).toBeInstanceOf(Map);
    });

    it('should allow disabling cache via options', () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn, { cache: false });
      
      expect(loader.cache).toBeNull();
    });
  });

  describe('load', () => {
    it('should load a single item', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k, name: `Item ${k}` })));
      const loader = new DataLoader(batchFn);

      const result = await loader.load(1);

      expect(result).toEqual({ id: 1, name: 'Item 1' });
    });

    it('should batch multiple loads in the same tick', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      const promise1 = loader.load(1);
      const promise2 = loader.load(2);
      const promise3 = loader.load(3);

      await Promise.all([promise1, promise2, promise3]);

      // Should only call batch function once with all keys
      expect(batchFn).toHaveBeenCalledTimes(1);
      expect(batchFn).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should return cached results on subsequent loads', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      await loader.load(1);
      await loader.load(1);
      await loader.load(1);

      expect(batchFn).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in batch function', async () => {
      const batchFn = jest.fn(async () => {
        throw new Error('Batch error');
      });
      const loader = new DataLoader(batchFn);

      await expect(loader.load(1)).rejects.toThrow('Batch error');
    });

    it('should reject when batch function returns wrong number of values', async () => {
      const batchFn = jest.fn(async () => [{ id: 1 }]); // Returns 1 value for 3 keys
      const loader = new DataLoader(batchFn);

      const promise1 = loader.load(1);
      const promise2 = loader.load(2);
      const promise3 = loader.load(3);

      await expect(Promise.all([promise1, promise2, promise3])).rejects.toThrow(
        'DataLoader batch function returned 1 values for 3 keys'
      );
    });
  });

  describe('loadMany', () => {
    it('should load multiple items', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      const results = await loader.loadMany([1, 2, 3]);

      expect(results.length).toBe(3);
      expect(results[0]).toEqual({ id: 1 });
      expect(results[1]).toEqual({ id: 2 });
      expect(results[2]).toEqual({ id: 3 });
    });

    it('should batch with single loads', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      const promise1 = loader.load(1);
      const promise2 = loader.loadMany([2, 3]);

      await Promise.all([promise1, promise2]);

      expect(batchFn).toHaveBeenCalledTimes(1);
      expect(batchFn).toHaveBeenCalledWith([1, 2, 3]);
    });
  });

  describe('clear', () => {
    it('should clear a single key from cache', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      await loader.load(1);
      loader.clear(1);
      await loader.load(1);

      expect(batchFn).toHaveBeenCalledTimes(2);
    });

    it('should return the loader for chaining', () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      const result = loader.clear(1);
      expect(result).toBe(loader);
    });
  });

  describe('clearAll', () => {
    it('should clear all keys from cache', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      await loader.loadMany([1, 2, 3]);
      loader.clearAll();
      await loader.loadMany([1, 2, 3]);

      expect(batchFn).toHaveBeenCalledTimes(2);
    });

    it('should return the loader for chaining', () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      const result = loader.clearAll();
      expect(result).toBe(loader);
    });
  });

  describe('prime', () => {
    it('should prime the cache with a value', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      loader.prime(1, { id: 1, name: 'Primed' });
      const result = await loader.load(1);

      expect(result).toEqual({ id: 1, name: 'Primed' });
      expect(batchFn).not.toHaveBeenCalled();
    });

    it('should not override existing cache entry', async () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k, name: 'Loaded' })));
      const loader = new DataLoader(batchFn);

      await loader.load(1);
      loader.prime(1, { id: 1, name: 'Primed' });
      const result = await loader.load(1);

      expect(result).toEqual({ id: 1, name: 'Loaded' });
    });

    it('should return the loader for chaining', () => {
      const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
      const loader = new DataLoader(batchFn);

      const result = loader.prime(1, { id: 1 });
      expect(result).toBe(loader);
    });
  });
});

describe('createLoaders', () => {
  let mockServices;

  beforeEach(() => {
    mockServices = {
      articleService: {
        getArticlesByIds: jest.fn(async (ids) => ids.map(id => ({ id, title: `Article ${id}` })))
      },
      topicService: {
        getTopicsByIds: jest.fn(async (ids) => ids.map(id => ({ id, name: `Topic ${id}` }))),
        getTopicsForArticles: jest.fn(async (ids) => {
          const result = {};
          ids.forEach(id => { result[id] = [{ id: id * 10, name: `Topic for ${id}` }]; });
          return result;
        })
      },
      sourceService: {
        getSourcesByIds: jest.fn(async (ids) => ids.map(id => ({ id, name: `Source ${id}` }))),
        getSourcesForArticles: jest.fn(async (ids) => {
          const result = {};
          ids.forEach(id => { result[id] = { id: id * 100, name: `Source for ${id}` }; });
          return result;
        })
      },
      userService: {
        getUsersByIds: jest.fn(async (ids) => ids.map(id => ({ id, email: `user${id}@example.com` }))),
        getSavedArticleIds: jest.fn(async () => [1, 2, 3])
      },
      sentimentService: {
        getSentimentBatch: jest.fn(async (ids) => ids.map(id => ({
          articleId: id,
          sentiment: { score: 0.5, label: 'neutral', magnitude: 0.3 }
        })))
      },
      workspaceService: {
        getMembersForWorkspaces: jest.fn(async (ids) => {
          const result = {};
          ids.forEach(id => { result[id] = [{ id: id * 10, role: 'member' }]; });
          return result;
        })
      },
      annotationService: {
        getAnnotationsForArticles: jest.fn(async (ids) => {
          const result = {};
          ids.forEach(id => { result[id] = [{ id: id * 10, text: `Annotation for ${id}` }]; });
          return result;
        })
      }
    };
  });

  it('should create loaders with correct names', () => {
    const loaders = createLoaders(mockServices);

    expect(loaders.articleLoader).toBeDefined();
    expect(loaders.topicLoader).toBeDefined();
    expect(loaders.sourceLoader).toBeDefined();
    expect(loaders.userLoader).toBeDefined();
    expect(loaders.sentimentLoader).toBeDefined();
    expect(loaders.articleTopicsLoader).toBeDefined();
    expect(loaders.articleSourceLoader).toBeDefined();
    expect(loaders.workspaceMembersLoader).toBeDefined();
    expect(loaders.annotationsLoader).toBeDefined();
  });

  it('should create article loader that batches requests', async () => {
    const loaders = createLoaders(mockServices);

    const promise1 = loaders.articleLoader.load(1);
    const promise2 = loaders.articleLoader.load(2);
    const promise3 = loaders.articleLoader.load(3);

    await Promise.all([promise1, promise2, promise3]);

    expect(mockServices.articleService.getArticlesByIds).toHaveBeenCalledTimes(1);
    expect(mockServices.articleService.getArticlesByIds).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('should create topic loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.topicLoader.load(1);

    expect(result).toEqual({ id: 1, name: 'Topic 1' });
    expect(mockServices.topicService.getTopicsByIds).toHaveBeenCalledWith([1]);
  });

  it('should create source loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.sourceLoader.load(1);

    expect(result).toEqual({ id: 1, name: 'Source 1' });
    expect(mockServices.sourceService.getSourcesByIds).toHaveBeenCalledWith([1]);
  });

  it('should create user loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.userLoader.load(1);

    expect(result).toEqual({ id: 1, email: 'user1@example.com' });
    expect(mockServices.userService.getUsersByIds).toHaveBeenCalledWith([1]);
  });

  it('should create sentiment loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.sentimentLoader.load(1);

    expect(result).toEqual({ score: 0.5, label: 'neutral', magnitude: 0.3 });
    expect(mockServices.sentimentService.getSentimentBatch).toHaveBeenCalledWith([1]);
  });

  it('should create article topics loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.articleTopicsLoader.load(1);

    expect(result).toEqual([{ id: 10, name: 'Topic for 1' }]);
    expect(mockServices.topicService.getTopicsForArticles).toHaveBeenCalledWith([1]);
  });

  it('should create article source loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.articleSourceLoader.load(1);

    expect(result).toEqual({ id: 100, name: 'Source for 1' });
    expect(mockServices.sourceService.getSourcesForArticles).toHaveBeenCalledWith([1]);
  });

  it('should create workspace members loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.workspaceMembersLoader.load(1);

    expect(result).toEqual([{ id: 10, role: 'member' }]);
    expect(mockServices.workspaceService.getMembersForWorkspaces).toHaveBeenCalledWith([1]);
  });

  it('should create annotations loader', async () => {
    const loaders = createLoaders(mockServices);

    const result = await loaders.annotationsLoader.load(1);

    expect(result).toEqual([{ id: 10, text: 'Annotation for 1' }]);
    expect(mockServices.annotationService.getAnnotationsForArticles).toHaveBeenCalledWith([1]);
  });

  it('should cache results within the same request', async () => {
    const loaders = createLoaders(mockServices);

    await loaders.articleLoader.load(1);
    await loaders.articleLoader.load(1);
    await loaders.articleLoader.load(1);

    expect(mockServices.articleService.getArticlesByIds).toHaveBeenCalledTimes(1);
  });

  it('should return null for missing items', async () => {
    mockServices.articleService.getArticlesByIds = jest.fn(async () => []);
    const loaders = createLoaders(mockServices);

    const result = await loaders.articleLoader.load(999);

    expect(result).toBeNull();
  });

  it('should handle missing services gracefully', () => {
    const loaders = createLoaders({});

    expect(loaders.articleLoader).toBeDefined();
    expect(loaders.topicLoader).toBeDefined();
  });

  it('should return null when service is missing', async () => {
    const loaders = createLoaders({});

    const result = await loaders.articleLoader.load(1);

    expect(result).toBeNull();
  });
});

describe('createSavedArticleLoader', () => {
  it('should create a loader for saved article status', async () => {
    const mockServices = {
      userService: {
        getSavedArticleIds: jest.fn(async () => [1, 3, 5])
      }
    };

    const loader = createSavedArticleLoader(100, mockServices);

    expect(loader).toBeInstanceOf(DataLoader);
  });

  it('should return true for saved articles', async () => {
    const mockServices = {
      userService: {
        getSavedArticleIds: jest.fn(async () => [1, 3, 5])
      }
    };

    const loader = createSavedArticleLoader(100, mockServices);
    const results = await loader.loadMany([1, 2, 3, 4, 5]);

    expect(results).toEqual([true, false, true, false, true]);
  });

  it('should call getSavedArticleIds with user ID', async () => {
    const mockServices = {
      userService: {
        getSavedArticleIds: jest.fn(async () => [])
      }
    };

    const loader = createSavedArticleLoader(42, mockServices);
    await loader.load(1);

    expect(mockServices.userService.getSavedArticleIds).toHaveBeenCalledWith(42);
  });

  it('should return false when service is missing', async () => {
    const loader = createSavedArticleLoader(100, {});
    const result = await loader.load(1);

    expect(result).toBe(false);
  });
});

describe('Loader with cache disabled', () => {
  it('should call batch function each time when cache disabled', async () => {
    const batchFn = jest.fn(async (keys) => keys.map(k => ({ id: k })));
    const loader = new DataLoader(batchFn, { cache: false });

    await loader.load(1);
    await loader.load(1);

    expect(batchFn).toHaveBeenCalledTimes(2);
  });
});
