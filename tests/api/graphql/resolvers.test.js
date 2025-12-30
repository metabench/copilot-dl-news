'use strict';

const { createResolvers } = require('../../../src/api/graphql/resolvers');

// Mock services
function createMockServices() {
  return {
    articleService: {
      searchArticles: jest.fn().mockResolvedValue([
        { id: 1, title: 'Article 1', url: 'https://example.com/1' },
        { id: 2, title: 'Article 2', url: 'https://example.com/2' }
      ]),
      getArticle: jest.fn().mockResolvedValue({ id: 1, title: 'Article 1' }),
      countArticles: jest.fn().mockResolvedValue(100)
    },
    topicService: {
      getTopics: jest.fn().mockResolvedValue([
        { id: 1, name: 'Technology' },
        { id: 2, name: 'Politics' }
      ])
    },
    storyService: {
      getStories: jest.fn().mockResolvedValue([
        { id: 1, headline: 'Story 1' }
      ]),
      getStory: jest.fn().mockResolvedValue({ id: 1, headline: 'Story 1' }),
      getStoryArticles: jest.fn().mockResolvedValue([]),
      getStoryPerspectives: jest.fn().mockResolvedValue([])
    },
    sourceService: {
      getSources: jest.fn().mockResolvedValue([
        { id: 1, name: 'Source 1', domain: 'example.com' }
      ])
    },
    userService: {
      getUser: jest.fn().mockResolvedValue({ id: 1, email: 'user@example.com' }),
      getSavedArticles: jest.fn().mockResolvedValue([]),
      saveArticle: jest.fn().mockResolvedValue(true),
      unsaveArticle: jest.fn().mockResolvedValue(true),
      updatePreferences: jest.fn().mockResolvedValue(true)
    },
    alertService: {
      getAlerts: jest.fn().mockResolvedValue([
        { id: 1, name: 'Alert 1', userId: 1 }
      ]),
      getAlert: jest.fn().mockResolvedValue({ id: 1, name: 'Alert 1', userId: 1 }),
      createAlert: jest.fn().mockResolvedValue({ id: 1, name: 'New Alert' }),
      updateAlert: jest.fn().mockResolvedValue({ id: 1, name: 'Updated Alert' }),
      deleteAlert: jest.fn().mockResolvedValue(true)
    },
    workspaceService: {
      listUserWorkspaces: jest.fn().mockResolvedValue([
        { id: 1, name: 'Workspace 1' }
      ]),
      getWorkspace: jest.fn().mockResolvedValue({ id: 1, name: 'Workspace 1' }),
      createWorkspace: jest.fn().mockResolvedValue({ id: 1, name: 'New Workspace' }),
      addMember: jest.fn().mockResolvedValue(true),
      removeMember: jest.fn().mockResolvedValue(true)
    },
    annotationService: {
      createAnnotation: jest.fn().mockResolvedValue({ id: 1, text: 'Note' }),
      deleteAnnotation: jest.fn().mockResolvedValue(true)
    },
    trendService: {
      getTrends: jest.fn().mockResolvedValue([])
    }
  };
}

// Mock context
function createMockContext(user = { id: 1, email: 'user@example.com' }) {
  return {
    user,
    loaders: {
      articleLoader: {
        load: jest.fn(async (id) => ({ id, title: `Article ${id}` })),
        loadMany: jest.fn(async (ids) => ids.map(id => ({ id, title: `Article ${id}` })))
      },
      topicLoader: {
        load: jest.fn(async (id) => ({ id, name: `Topic ${id}` })),
        loadMany: jest.fn(async (ids) => ids.map(id => ({ id, name: `Topic ${id}` })))
      },
      sourceLoader: {
        load: jest.fn(async (id) => ({ id, name: `Source ${id}` }))
      },
      userLoader: {
        load: jest.fn(async (id) => ({ id, email: `user${id}@example.com` }))
      },
      sentimentLoader: {
        load: jest.fn(async (id) => ({ score: 0.5, label: 'positive' }))
      },
      articleTopicsLoader: {
        load: jest.fn(async (id) => [{ id: 1, name: 'Tech' }])
      },
      articleSourceLoader: {
        load: jest.fn(async (id) => ({ id: 1, name: 'Source 1' }))
      },
      workspaceMembersLoader: {
        load: jest.fn(async (id) => [])
      }
    }
  };
}

describe('GraphQL Resolvers', () => {
  let services;
  let resolvers;
  let context;

  beforeEach(() => {
    services = createMockServices();
    resolvers = createResolvers(services);
    context = createMockContext();
  });

  describe('createResolvers', () => {
    it('should create resolvers object', () => {
      expect(resolvers).toBeDefined();
      expect(resolvers.Query).toBeDefined();
      expect(resolvers.Mutation).toBeDefined();
    });

    it('should include type resolvers', () => {
      expect(resolvers.Article).toBeDefined();
      expect(resolvers.Story).toBeDefined();
      expect(resolvers.Workspace).toBeDefined();
    });
  });

  describe('Query resolvers', () => {
    describe('articles', () => {
      it('should return articles', async () => {
        const result = await resolvers.Query.articles(null, {}, context);

        expect(result.length).toBe(2);
        expect(services.articleService.searchArticles).toHaveBeenCalled();
      });

      it('should apply limit and offset', async () => {
        await resolvers.Query.articles(null, { limit: 10, offset: 20 }, context);

        expect(services.articleService.searchArticles).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 10, offset: 20 })
        );
      });

      it('should apply filters', async () => {
        await resolvers.Query.articles(null, { 
          filter: { topic: 'tech' } 
        }, context);

        expect(services.articleService.searchArticles).toHaveBeenCalledWith(
          expect.objectContaining({ topic: 'tech' })
        );
      });
    });

    describe('article', () => {
      it('should return article by ID', async () => {
        const result = await resolvers.Query.article(null, { id: 1 }, context);

        expect(result).toBeDefined();
        expect(result.id).toBe(1);
      });
    });

    describe('topics', () => {
      it('should return topics', async () => {
        const result = await resolvers.Query.topics(null, {}, context);

        expect(result.length).toBe(2);
        expect(services.topicService.getTopics).toHaveBeenCalled();
      });

      it('should apply limit', async () => {
        await resolvers.Query.topics(null, { limit: 10 }, context);

        expect(services.topicService.getTopics).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 10 })
        );
      });
    });

    describe('topic', () => {
      it('should return topic by ID using loader', async () => {
        const result = await resolvers.Query.topic(null, { id: 1 }, context);

        expect(result).toBeDefined();
        expect(context.loaders.topicLoader.load).toHaveBeenCalledWith(1);
      });
    });

    describe('stories', () => {
      it('should return stories', async () => {
        const result = await resolvers.Query.stories(null, {}, context);

        expect(result.length).toBe(1);
        expect(services.storyService.getStories).toHaveBeenCalled();
      });
    });

    describe('story', () => {
      it('should return story by ID', async () => {
        const result = await resolvers.Query.story(null, { id: 1 }, context);

        expect(result).toBeDefined();
        expect(result.id).toBe(1);
      });
    });

    describe('sources', () => {
      it('should return sources', async () => {
        const result = await resolvers.Query.sources(null, {}, context);

        expect(result.length).toBe(1);
        expect(services.sourceService.getSources).toHaveBeenCalled();
      });
    });

    describe('alerts', () => {
      it('should return alerts for current user', async () => {
        const result = await resolvers.Query.alerts(null, {}, context);

        expect(result.length).toBe(1);
        expect(services.alertService.getAlerts).toHaveBeenCalledWith(1);
      });

      it('should require authentication', async () => {
        const anonContext = { user: null, loaders: {} };

        await expect(resolvers.Query.alerts(null, {}, anonContext))
          .rejects.toThrow('Authentication required');
      });
    });

    describe('workspaces', () => {
      it('should return workspaces for current user', async () => {
        const result = await resolvers.Query.workspaces(null, {}, context);

        expect(result.length).toBe(1);
        expect(services.workspaceService.listUserWorkspaces).toHaveBeenCalledWith(1);
      });
    });

    describe('me', () => {
      it('should return current user', async () => {
        const result = await resolvers.Query.me(null, {}, context);

        expect(result).toBeDefined();
        expect(result.email).toBe('user@example.com');
      });

      it('should return null when not authenticated', async () => {
        const anonContext = { user: null, loaders: {} };
        const result = await resolvers.Query.me(null, {}, anonContext);

        expect(result).toBeNull();
      });
    });

    describe('savedArticles', () => {
      it('should return saved articles for current user', async () => {
        const result = await resolvers.Query.savedArticles(null, {}, context);

        expect(Array.isArray(result)).toBe(true);
        expect(services.userService.getSavedArticles).toHaveBeenCalledWith(
          1, 
          expect.objectContaining({ limit: 20, offset: 0 })
        );
      });
    });

    describe('trends', () => {
      it('should return trends', async () => {
        const result = await resolvers.Query.trends(null, {}, context);

        expect(Array.isArray(result)).toBe(true);
        expect(services.trendService.getTrends).toHaveBeenCalled();
      });
    });
  });

  describe('Mutation resolvers', () => {
    describe('saveArticle', () => {
      it('should save an article', async () => {
        const result = await resolvers.Mutation.saveArticle(null, { id: 1 }, context);

        expect(result).toBeDefined();
        expect(services.userService.saveArticle).toHaveBeenCalledWith(1, 1);
      });

      it('should require authentication', async () => {
        const anonContext = { user: null, loaders: {} };

        await expect(resolvers.Mutation.saveArticle(null, { id: 1 }, anonContext))
          .rejects.toThrow('Authentication required');
      });
    });

    describe('unsaveArticle', () => {
      it('should unsave an article', async () => {
        const result = await resolvers.Mutation.unsaveArticle(null, { id: 1 }, context);

        expect(result).toBe(true);
        expect(services.userService.unsaveArticle).toHaveBeenCalledWith(1, 1);
      });
    });

    describe('createAlert', () => {
      it('should create an alert', async () => {
        const input = { name: 'New Alert', query: 'tech' };
        const result = await resolvers.Mutation.createAlert(null, { input }, context);

        expect(result).toBeDefined();
        expect(services.alertService.createAlert).toHaveBeenCalledWith(1, input);
      });
    });

    describe('updateAlert', () => {
      it('should update an alert', async () => {
        const input = { name: 'Updated Alert' };
        const result = await resolvers.Mutation.updateAlert(null, { 
          id: 1, 
          input 
        }, context);

        expect(result).toBeDefined();
        expect(services.alertService.updateAlert).toHaveBeenCalledWith(1, 1, input);
      });
    });

    describe('deleteAlert', () => {
      it('should delete an alert', async () => {
        const result = await resolvers.Mutation.deleteAlert(null, { id: 1 }, context);

        expect(result).toBe(true);
        expect(services.alertService.deleteAlert).toHaveBeenCalledWith(1, 1);
      });
    });

    describe('updatePreferences', () => {
      it('should update user preferences', async () => {
        const input = { theme: 'dark', notifications: true };
        
        await resolvers.Mutation.updatePreferences(null, { input }, context);

        expect(services.userService.updatePreferences).toHaveBeenCalledWith(1, input);
      });
    });

    describe('createAnnotation', () => {
      it('should create an annotation', async () => {
        const input = { text: 'Note', type: 'note' };
        const result = await resolvers.Mutation.createAnnotation(null, { 
          articleId: 1, 
          input 
        }, context);

        expect(result).toBeDefined();
        expect(services.annotationService.createAnnotation).toHaveBeenCalledWith(1, 1, input);
      });
    });

    describe('deleteAnnotation', () => {
      it('should delete an annotation', async () => {
        const result = await resolvers.Mutation.deleteAnnotation(null, { id: 1 }, context);

        expect(result).toBe(true);
        expect(services.annotationService.deleteAnnotation).toHaveBeenCalledWith(1, 1);
      });
    });

    describe('createWorkspace', () => {
      it('should create a workspace', async () => {
        const result = await resolvers.Mutation.createWorkspace(null, { 
          name: 'New Workspace',
          slug: 'new-workspace'
        }, context);

        expect(result).toBeDefined();
        expect(services.workspaceService.createWorkspace).toHaveBeenCalledWith(
          1,
          { name: 'New Workspace', slug: 'new-workspace' }
        );
      });
    });

    describe('inviteToWorkspace', () => {
      it('should invite a user to workspace', async () => {
        const result = await resolvers.Mutation.inviteToWorkspace(null, { 
          workspaceId: 1,
          userId: 2,
          role: 'editor'
        }, context);

        expect(result).toBe(true);
        expect(services.workspaceService.addMember).toHaveBeenCalledWith(1, 1, 2, 'editor');
      });
    });

    describe('leaveWorkspace', () => {
      it('should leave a workspace', async () => {
        const result = await resolvers.Mutation.leaveWorkspace(null, { 
          workspaceId: 1 
        }, context);

        expect(result).toBe(true);
        expect(services.workspaceService.removeMember).toHaveBeenCalledWith(1, 1);
      });
    });
  });

  describe('Type resolvers', () => {
    describe('Article', () => {
      it('should resolve source using loader', async () => {
        const article = { id: 1, sourceId: 5 };
        const result = await resolvers.Article.source(article, {}, context);

        expect(result).toBeDefined();
        expect(context.loaders.sourceLoader.load).toHaveBeenCalledWith(5);
      });

      it('should return existing source if present', async () => {
        const article = { id: 1, source: { id: 5, name: 'Existing' } };
        const result = await resolvers.Article.source(article, {}, context);

        expect(result.name).toBe('Existing');
      });

      it('should resolve topics using loader', async () => {
        const article = { id: 1 };
        const result = await resolvers.Article.topics(article, {}, context);

        expect(Array.isArray(result)).toBe(true);
        expect(context.loaders.articleTopicsLoader.load).toHaveBeenCalledWith(1);
      });

      it('should return existing topics if present', async () => {
        const article = { id: 1, topics: [{ id: 1, name: 'Tech' }] };
        const result = await resolvers.Article.topics(article, {}, context);

        expect(result[0].name).toBe('Tech');
      });

      it('should resolve sentiment using loader', async () => {
        const article = { id: 1 };
        const result = await resolvers.Article.sentiment(article, {}, context);

        expect(result).toBeDefined();
        expect(context.loaders.sentimentLoader.load).toHaveBeenCalledWith(1);
      });

      it('should resolve savedByUser', async () => {
        const article = { id: 1 };
        const result = await resolvers.Article.savedByUser(article, {}, context);

        expect(typeof result).toBe('boolean');
      });
    });

    describe('Story', () => {
      it('should resolve articles using service', async () => {
        const story = { id: 1 };
        const result = await resolvers.Story.articles(story, {}, context);

        expect(Array.isArray(result)).toBe(true);
        expect(services.storyService.getStoryArticles).toHaveBeenCalledWith(1);
      });

      it('should return existing articles if present', async () => {
        const story = { id: 1, articles: [{ id: 1, title: 'Article' }] };
        const result = await resolvers.Story.articles(story, {}, context);

        expect(result[0].title).toBe('Article');
      });

      it('should resolve articleCount', () => {
        const story = { articleCount: 5 };
        const result = resolvers.Story.articleCount(story);

        expect(result).toBe(5);
      });

      it('should calculate articleCount from articles array', () => {
        const story = { articles: [1, 2, 3] };
        const result = resolvers.Story.articleCount(story);

        expect(result).toBe(3);
      });

      it('should resolve perspectives', async () => {
        const story = { id: 1 };
        const result = await resolvers.Story.perspectives(story);

        expect(Array.isArray(result)).toBe(true);
      });
    });

    describe('Workspace', () => {
      it('should resolve owner using loader', async () => {
        const workspace = { id: 1, ownerId: 5 };
        const result = await resolvers.Workspace.owner(workspace, {}, context);

        expect(result).toBeDefined();
        expect(context.loaders.userLoader.load).toHaveBeenCalledWith(5);
      });

      it('should resolve members using loader', async () => {
        const workspace = { id: 1 };
        const result = await resolvers.Workspace.members(workspace, {}, context);

        expect(Array.isArray(result)).toBe(true);
      });

      it('should resolve memberCount', async () => {
        const workspace = { memberCount: 5 };
        const result = await resolvers.Workspace.memberCount(workspace);

        expect(result).toBe(5);
      });
    });

    describe('User', () => {
      it('should resolve preferences', () => {
        const user = { id: 1, preferences: { theme: 'dark' } };
        const result = resolvers.User.preferences(user);

        expect(result.theme).toBe('dark');
      });

      it('should return null if no preferences', () => {
        const user = { id: 1 };
        const result = resolvers.User.preferences(user);

        expect(result).toBeNull();
      });

      it('should resolve subscription', () => {
        const user = { id: 1, subscription: { plan: 'pro' } };
        const result = resolvers.User.subscription(user);

        expect(result.plan).toBe('pro');
      });
    });

    describe('Annotation', () => {
      it('should resolve user using loader', async () => {
        const annotation = { id: 1, userId: 5 };
        const result = await resolvers.Annotation.user(annotation, {}, context);

        expect(result).toBeDefined();
        expect(context.loaders.userLoader.load).toHaveBeenCalledWith(5);
      });
    });

    describe('Perspective', () => {
      it('should resolve source using loader', async () => {
        const perspective = { id: 1, sourceId: 5 };
        const result = await resolvers.Perspective.source(perspective, {}, context);

        expect(result).toBeDefined();
        expect(context.loaders.sourceLoader.load).toHaveBeenCalledWith(5);
      });
    });

    describe('Trend', () => {
      it('should resolve topic using loader', async () => {
        const trend = { id: 1, topicId: 5 };
        const result = await resolvers.Trend.topic(trend, {}, context);

        expect(result).toBeDefined();
        expect(context.loaders.topicLoader.load).toHaveBeenCalledWith(5);
      });
    });
  });

  describe('Scalar resolvers', () => {
    describe('DateTime', () => {
      it('should serialize Date to ISO string', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const result = resolvers.DateTime.serialize(date);

        expect(result).toBe('2024-01-15T12:00:00.000Z');
      });

      it('should parse value to Date', () => {
        const result = resolvers.DateTime.parseValue('2024-01-15T12:00:00Z');

        expect(result instanceof Date).toBe(true);
      });
    });

    describe('JSON', () => {
      it('should serialize JSON value', () => {
        const obj = { key: 'value' };
        const result = resolvers.JSON.serialize(obj);

        expect(result).toEqual({ key: 'value' });
      });

      it('should parse JSON value', () => {
        const obj = { key: 'value' };
        const result = resolvers.JSON.parseValue(obj);

        expect(result).toEqual({ key: 'value' });
      });
    });
  });

  describe('Error handling', () => {
    it('should handle not found gracefully', async () => {
      services.articleService.getArticle.mockResolvedValue(null);

      const result = await resolvers.Query.article(null, { id: 999 }, context);
      expect(result).toBeNull();
    });

    it('should require auth for protected queries', async () => {
      const anonContext = { user: null, loaders: {} };

      await expect(resolvers.Query.savedArticles(null, {}, anonContext))
        .rejects.toThrow('Authentication required');
    });
  });
});
