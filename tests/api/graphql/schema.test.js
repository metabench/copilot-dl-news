'use strict';

const { typeDefs } = require('../../../src/api/graphql/schema');

describe('GraphQL Schema', () => {
  describe('typeDefs', () => {
    it('should export type definitions as a string', () => {
      expect(typeof typeDefs).toBe('string');
      expect(typeDefs.length).toBeGreaterThan(0);
    });

    it('should define Query type', () => {
      expect(typeDefs).toContain('type Query');
    });

    it('should define Mutation type', () => {
      expect(typeDefs).toContain('type Mutation');
    });

    it('should define Subscription type', () => {
      expect(typeDefs).toContain('type Subscription');
    });
  });

  describe('Article type', () => {
    it('should define Article with required fields', () => {
      expect(typeDefs).toContain('type Article');
      expect(typeDefs).toMatch(/id:\s*ID!/);
      expect(typeDefs).toMatch(/title:\s*String!/);
      expect(typeDefs).toMatch(/url:\s*String!/);
    });

    it('should include optional fields', () => {
      expect(typeDefs).toMatch(/summary:\s*String/);
      expect(typeDefs).toMatch(/content:\s*String/);
      expect(typeDefs).toMatch(/publishedAt:\s*String/);
    });

    it('should include relationships', () => {
      expect(typeDefs).toMatch(/source:\s*Source/);
      expect(typeDefs).toMatch(/topics:\s*\[Topic!\]/);
      expect(typeDefs).toMatch(/sentiment:\s*Sentiment/);
    });
  });

  describe('Sentiment type', () => {
    it('should define Sentiment with score and label', () => {
      expect(typeDefs).toContain('type Sentiment');
      expect(typeDefs).toMatch(/score:\s*Float/);
      expect(typeDefs).toMatch(/label:\s*String/);
    });
  });

  describe('Topic type', () => {
    it('should define Topic with name', () => {
      expect(typeDefs).toContain('type Topic');
      expect(typeDefs).toMatch(/name:\s*String!/);
    });
  });

  describe('Story type', () => {
    it('should define Story with title and articles', () => {
      expect(typeDefs).toContain('type Story');
      expect(typeDefs).toMatch(/title:\s*String!/);
      expect(typeDefs).toMatch(/articles:\s*\[Article!\]!/);
    });
  });

  describe('Source type', () => {
    it('should define Source with name and domain', () => {
      expect(typeDefs).toContain('type Source');
      expect(typeDefs).toMatch(/name:\s*String/);
      expect(typeDefs).toMatch(/domain:\s*String/);
    });
  });

  describe('User type', () => {
    it('should define User with authentication fields', () => {
      expect(typeDefs).toContain('type User');
      expect(typeDefs).toMatch(/email:\s*String!/);
    });

    it('should include user preferences', () => {
      expect(typeDefs).toMatch(/preferences:\s*UserPreferences/);
    });
  });

  describe('Alert type', () => {
    it('should define Alert with conditions', () => {
      expect(typeDefs).toContain('type Alert');
      expect(typeDefs).toMatch(/name:\s*String!/);
      expect(typeDefs).toMatch(/conditions:\s*JSON!/);
    });
  });

  describe('Workspace type', () => {
    it('should define Workspace for team collaboration', () => {
      expect(typeDefs).toContain('type Workspace');
      expect(typeDefs).toMatch(/name:\s*String!/);
    });
  });

  describe('Annotation type', () => {
    it('should define Annotation for article annotations', () => {
      expect(typeDefs).toContain('type Annotation');
    });
  });

  describe('Query type', () => {
    it('should define articles query with filters', () => {
      expect(typeDefs).toMatch(/articles\s*\(/);
      expect(typeDefs).toMatch(/limit:\s*Int/);
      expect(typeDefs).toMatch(/offset:\s*Int/);
    });

    it('should define article by ID query', () => {
      expect(typeDefs).toMatch(/article\s*\(\s*id:\s*ID!\s*\)/);
    });

    it('should define topics query', () => {
      expect(typeDefs).toMatch(/topics\s*[:(]/);
    });

    it('should define stories query', () => {
      expect(typeDefs).toMatch(/stories\s*[:(]/);
    });

    it('should define alerts query', () => {
      expect(typeDefs).toMatch(/alerts\s*[:(]/);
    });

    it('should define workspaces query', () => {
      expect(typeDefs).toMatch(/workspaces\s*[:(]/);
    });

    it('should define me query for current user', () => {
      expect(typeDefs).toMatch(/me:\s*User/);
    });
  });

  describe('Mutation type', () => {
    it('should define saveArticle mutation', () => {
      expect(typeDefs).toMatch(/saveArticle\s*\(/);
    });

    it('should define createAlert mutation', () => {
      expect(typeDefs).toMatch(/createAlert\s*\(/);
    });

    it('should define updatePreferences mutation', () => {
      expect(typeDefs).toMatch(/updatePreferences\s*\(/);
    });

    it('should define createAnnotation mutation', () => {
      expect(typeDefs).toMatch(/createAnnotation\s*\(/);
    });
  });

  describe('Subscription type', () => {
    it('should define articleAdded subscription', () => {
      expect(typeDefs).toMatch(/articleAdded\s*[:(]/);
    });

    it('should define alertTriggered subscription', () => {
      expect(typeDefs).toMatch(/alertTriggered\s*[:(]/);
    });

    it('should define breakingNews subscription', () => {
      expect(typeDefs).toMatch(/breakingNews\s*[:(]/);
    });

    it('should define storyUpdated subscription', () => {
      expect(typeDefs).toMatch(/storyUpdated\s*[:(]/);
    });
  });

  describe('Input types', () => {
    it('should define ArticleFilter input', () => {
      expect(typeDefs).toMatch(/input\s+ArticleFilter/);
    });

    it('should define AlertInput input', () => {
      expect(typeDefs).toMatch(/input\s+AlertInput/);
    });

    it('should define PreferencesInput input', () => {
      expect(typeDefs).toMatch(/input\s+PreferencesInput/);
    });

    it('should define AnnotationInput input', () => {
      expect(typeDefs).toMatch(/input\s+AnnotationInput/);
    });
  });

  describe('Schema validation', () => {
    it('should have balanced braces', () => {
      const openBraces = (typeDefs.match(/{/g) || []).length;
      const closeBraces = (typeDefs.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });

    it('should not have syntax errors in type definitions', () => {
      // Basic syntax checks
      expect(typeDefs).not.toMatch(/type\s+\{/); // type without name
      expect(typeDefs).not.toMatch(/:\s*$/m); // colon at end of line without type
    });

    it('should use consistent ID type', () => {
      // All id fields should use ID! type
      const idFields = typeDefs.match(/\bid:\s*\w+/g) || [];
      idFields.forEach(field => {
        expect(field).toMatch(/id:\s*ID/);
      });
    });
  });
});
