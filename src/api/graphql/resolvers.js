'use strict';

/**
 * GraphQL Resolvers
 * @module api/graphql/resolvers
 */

/**
 * Create resolvers with injected services
 * @param {Object} services - Service instances
 * @returns {Object} Resolvers
 */
function createResolvers(services) {
  const { 
    articleService, 
    topicService, 
    storyService,
    sourceService,
    alertService, 
    userService,
    workspaceService,
    annotationService,
    trendService
  } = services;

  return {
    // ==================== QUERY RESOLVERS ====================
    Query: {
      // Articles
      articles: async (_, { filter = {}, limit = 20, offset = 0 }, context) => {
        const options = {
          ...filter,
          limit,
          offset,
          userId: context.user?.id
        };
        
        if (articleService?.searchArticles) {
          return articleService.searchArticles(options);
        }
        return [];
      },

      articlesConnection: async (_, { filter = {}, pagination = {} }, context) => {
        const { first = 20, after, last, before } = pagination;
        const limit = first || last || 20;
        let offset = 0;
        
        if (after) {
          offset = parseInt(Buffer.from(after, 'base64').toString(), 10) + 1;
        }
        
        const options = { ...filter, limit: limit + 1, offset };
        const articles = articleService?.searchArticles 
          ? await articleService.searchArticles(options)
          : [];
        
        const hasNextPage = articles.length > limit;
        if (hasNextPage) articles.pop();
        
        return {
          edges: articles.map((article, index) => ({
            node: article,
            cursor: Buffer.from(String(offset + index)).toString('base64')
          })),
          pageInfo: {
            hasNextPage,
            hasPreviousPage: offset > 0,
            startCursor: articles.length > 0 
              ? Buffer.from(String(offset)).toString('base64')
              : null,
            endCursor: articles.length > 0
              ? Buffer.from(String(offset + articles.length - 1)).toString('base64')
              : null,
            totalCount: articleService?.countArticles 
              ? await articleService.countArticles(filter)
              : null
          }
        };
      },

      article: async (_, { id }, context) => {
        if (articleService?.getArticle) {
          return articleService.getArticle(id);
        }
        return context.loaders?.articleLoader?.load(id) || null;
      },

      savedArticles: async (_, { limit = 20, offset = 0 }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (userService?.getSavedArticles) {
          return userService.getSavedArticles(context.user.id, { limit, offset });
        }
        return [];
      },

      // Topics & Stories
      topics: async (_, { limit = 50 }) => {
        if (topicService?.getTopics) {
          return topicService.getTopics({ limit });
        }
        return [];
      },

      topic: async (_, { id }, context) => {
        return context.loaders?.topicLoader?.load(id) || null;
      },

      stories: async (_, { limit = 20, offset = 0 }) => {
        if (storyService?.getStories) {
          return storyService.getStories({ limit, offset });
        }
        return [];
      },

      story: async (_, { id }) => {
        if (storyService?.getStory) {
          return storyService.getStory(id);
        }
        return null;
      },

      trends: async (_, { period = '24h', limit = 10 }) => {
        if (trendService?.getTrends) {
          return trendService.getTrends({ period, limit });
        }
        return [];
      },

      // Sources
      sources: async (_, { limit = 100 }) => {
        if (sourceService?.getSources) {
          return sourceService.getSources({ limit });
        }
        return [];
      },

      source: async (_, { id }, context) => {
        return context.loaders?.sourceLoader?.load(id) || null;
      },

      // Alerts
      alerts: async (_, __, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (alertService?.getAlerts) {
          return alertService.getAlerts(context.user.id);
        }
        return [];
      },

      alert: async (_, { id }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (alertService?.getAlert) {
          const alert = await alertService.getAlert(id);
          if (alert && alert.userId !== context.user.id) {
            throw new Error('Not authorized');
          }
          return alert;
        }
        return null;
      },

      // Workspaces
      workspaces: async (_, __, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (workspaceService?.listUserWorkspaces) {
          return workspaceService.listUserWorkspaces(context.user.id);
        }
        return [];
      },

      workspace: async (_, { id }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (workspaceService?.getWorkspace) {
          return workspaceService.getWorkspace(id);
        }
        return null;
      },

      // User
      me: async (_, __, context) => {
        if (!context.user) return null;
        
        if (userService?.getUser) {
          return userService.getUser(context.user.id);
        }
        return context.user;
      }
    },

    // ==================== MUTATION RESOLVERS ====================
    Mutation: {
      // Articles
      saveArticle: async (_, { id }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (userService?.saveArticle) {
          await userService.saveArticle(context.user.id, id);
          return articleService?.getArticle?.(id) || { id };
        }
        return { id };
      },

      unsaveArticle: async (_, { id }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (userService?.unsaveArticle) {
          return userService.unsaveArticle(context.user.id, id);
        }
        return false;
      },

      // Alerts
      createAlert: async (_, { input }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (alertService?.createAlert) {
          return alertService.createAlert(context.user.id, input);
        }
        throw new Error('Alert service not available');
      },

      updateAlert: async (_, { id, input }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (alertService?.updateAlert) {
          return alertService.updateAlert(id, context.user.id, input);
        }
        throw new Error('Alert service not available');
      },

      deleteAlert: async (_, { id }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (alertService?.deleteAlert) {
          return alertService.deleteAlert(id, context.user.id);
        }
        return false;
      },

      // User Preferences
      updatePreferences: async (_, { input }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (userService?.updatePreferences) {
          await userService.updatePreferences(context.user.id, input);
          return userService.getUser(context.user.id);
        }
        throw new Error('User service not available');
      },

      // Annotations
      createAnnotation: async (_, { articleId, input }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (annotationService?.createAnnotation) {
          return annotationService.createAnnotation(context.user.id, articleId, input);
        }
        throw new Error('Annotation service not available');
      },

      deleteAnnotation: async (_, { id }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (annotationService?.deleteAnnotation) {
          return annotationService.deleteAnnotation(id, context.user.id);
        }
        return false;
      },

      // Workspaces
      createWorkspace: async (_, { name, slug }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (workspaceService?.createWorkspace) {
          return workspaceService.createWorkspace(context.user.id, { name, slug });
        }
        throw new Error('Workspace service not available');
      },

      inviteToWorkspace: async (_, { workspaceId, userId, role = 'viewer' }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (workspaceService?.addMember) {
          await workspaceService.addMember(workspaceId, context.user.id, userId, role);
          return true;
        }
        return false;
      },

      leaveWorkspace: async (_, { workspaceId }, context) => {
        if (!context.user) throw new Error('Authentication required');
        
        if (workspaceService?.removeMember) {
          await workspaceService.removeMember(workspaceId, context.user.id);
          return true;
        }
        return false;
      }
    },

    // ==================== TYPE RESOLVERS ====================
    Article: {
      sentiment: async (article, _, context) => {
        if (article.sentiment) return article.sentiment;
        return context.loaders?.sentimentLoader?.load(article.id) || null;
      },

      topics: async (article, _, context) => {
        if (article.topics) return article.topics;
        return context.loaders?.articleTopicsLoader?.load(article.id) || [];
      },

      source: async (article, _, context) => {
        if (article.source) return article.source;
        if (article.sourceId) {
          return context.loaders?.sourceLoader?.load(article.sourceId) || null;
        }
        return context.loaders?.articleSourceLoader?.load(article.id) || null;
      },

      savedByUser: async (article, _, context) => {
        if (!context.user) return false;
        if (context.savedArticleLoader) {
          return context.savedArticleLoader.load(article.id);
        }
        return false;
      }
    },

    Story: {
      articles: async (story, _, context) => {
        if (story.articles) return story.articles;
        if (story.articleIds && context.loaders?.articleLoader) {
          return context.loaders.articleLoader.loadMany(story.articleIds);
        }
        if (storyService?.getStoryArticles) {
          return storyService.getStoryArticles(story.id);
        }
        return [];
      },

      articleCount: (story) => {
        if (story.articleCount !== undefined) return story.articleCount;
        if (story.articles) return story.articles.length;
        if (story.articleIds) return story.articleIds.length;
        return 0;
      },

      perspectives: async (story) => {
        if (story.perspectives) return story.perspectives;
        if (storyService?.getStoryPerspectives) {
          return storyService.getStoryPerspectives(story.id);
        }
        return [];
      }
    },

    Workspace: {
      owner: async (workspace, _, context) => {
        if (workspace.owner) return workspace.owner;
        return context.loaders?.userLoader?.load(workspace.ownerId) || null;
      },

      members: async (workspace, _, context) => {
        if (workspace.members) return workspace.members;
        return context.loaders?.workspaceMembersLoader?.load(workspace.id) || [];
      },

      memberCount: async (workspace) => {
        if (workspace.memberCount !== undefined) return workspace.memberCount;
        if (workspace.members) return workspace.members.length;
        return 0;
      }
    },

    WorkspaceMember: {
      user: async (member, _, context) => {
        if (member.user) return member.user;
        return context.loaders?.userLoader?.load(member.userId) || null;
      }
    },

    Annotation: {
      user: async (annotation, _, context) => {
        if (annotation.user) return annotation.user;
        return context.loaders?.userLoader?.load(annotation.userId) || null;
      }
    },

    Perspective: {
      source: async (perspective, _, context) => {
        if (perspective.source) return perspective.source;
        return context.loaders?.sourceLoader?.load(perspective.sourceId) || null;
      }
    },

    Trend: {
      topic: async (trend, _, context) => {
        if (trend.topic) return trend.topic;
        return context.loaders?.topicLoader?.load(trend.topicId) || null;
      }
    },

    User: {
      preferences: (user) => user.preferences || null,
      subscription: (user) => user.subscription || null
    },

    // ==================== SCALAR RESOLVERS ====================
    DateTime: {
      serialize: (value) => value instanceof Date ? value.toISOString() : value,
      parseValue: (value) => new Date(value),
      parseLiteral: (ast) => new Date(ast.value)
    },

    JSON: {
      serialize: (value) => value,
      parseValue: (value) => value,
      parseLiteral: (ast) => parseLiteralJSON(ast)
    }
  };
}

/**
 * Parse JSON literal from GraphQL AST
 */
function parseLiteralJSON(ast) {
  switch (ast.kind) {
    case 'StringValue':
    case 'BooleanValue':
      return ast.value;
    case 'IntValue':
    case 'FloatValue':
      return parseFloat(ast.value);
    case 'ObjectValue':
      const obj = {};
      ast.fields.forEach(field => {
        obj[field.name.value] = parseLiteralJSON(field.value);
      });
      return obj;
    case 'ListValue':
      return ast.values.map(parseLiteralJSON);
    case 'NullValue':
      return null;
    default:
      return null;
  }
}

module.exports = { createResolvers };
