'use strict';

/**
 * GraphQL Schema Type Definitions
 * @module api/graphql/schema
 */

const typeDefs = `
  # ==================== SCALAR TYPES ====================
  
  scalar DateTime
  scalar JSON
  
  # ==================== ARTICLE TYPES ====================
  
  type Article {
    id: ID!
    title: String!
    url: String!
    content: String
    summary: String
    sentiment: Sentiment
    topics: [Topic!]
    source: Source
    publishedAt: String
    createdAt: String!
    savedByUser: Boolean
  }
  
  type Sentiment {
    score: Float!
    label: String!
    magnitude: Float
    entities: [EntitySentiment!]
  }
  
  type EntitySentiment {
    entity: String!
    score: Float!
    mentions: Int
  }
  
  # ==================== TOPIC TYPES ====================
  
  type Topic {
    id: ID!
    name: String!
    slug: String
    confidence: Float
    articleCount: Int
  }
  
  type Story {
    id: ID!
    title: String!
    articles: [Article!]!
    articleCount: Int!
    perspectives: [Perspective!]
    createdAt: String
    updatedAt: String
  }
  
  type Perspective {
    source: Source!
    tone: String!
    summary: String
    articleId: ID
  }
  
  type Trend {
    topic: Topic!
    velocity: Float!
    change: Float!
    period: String!
  }
  
  # ==================== SOURCE TYPES ====================
  
  type Source {
    id: ID!
    name: String!
    domain: String!
    credibility: Float
    bias: String
    articleCount: Int
  }
  
  # ==================== USER TYPES ====================
  
  type User {
    id: ID!
    email: String!
    name: String
    preferences: UserPreferences
    subscription: UserSubscription
    createdAt: String
  }
  
  type UserPreferences {
    topics: [String!]
    sources: [String!]
    excludedTopics: [String!]
    excludedSources: [String!]
  }
  
  type UserSubscription {
    plan: String!
    status: String!
    currentPeriodEnd: String
  }
  
  # ==================== ALERT TYPES ====================
  
  type Alert {
    id: ID!
    name: String!
    conditions: JSON!
    enabled: Boolean!
    lastTriggered: String
    triggerCount: Int
    createdAt: String
  }
  
  type AlertTrigger {
    id: ID!
    alertId: ID!
    articleId: ID
    triggeredAt: String!
    data: JSON
  }
  
  # ==================== WORKSPACE TYPES ====================
  
  type Workspace {
    id: ID!
    name: String!
    slug: String!
    owner: User!
    members: [WorkspaceMember!]!
    memberCount: Int!
    createdAt: String
  }
  
  type WorkspaceMember {
    user: User!
    role: String!
    joinedAt: String
  }
  
  type Annotation {
    id: ID!
    articleId: ID!
    user: User!
    type: String!
    data: JSON!
    createdAt: String
  }
  
  # ==================== PAGINATION ====================
  
  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
    totalCount: Int
  }
  
  type ArticleConnection {
    edges: [ArticleEdge!]!
    pageInfo: PageInfo!
  }
  
  type ArticleEdge {
    node: Article!
    cursor: String!
  }
  
  # ==================== INPUT TYPES ====================
  
  input ArticleFilter {
    search: String
    topic: String
    source: String
    domain: String
    fromDate: String
    toDate: String
    sentiment: String
    saved: Boolean
  }
  
  input AlertInput {
    name: String!
    conditions: JSON!
    enabled: Boolean
  }
  
  input PreferencesInput {
    topics: [String!]
    sources: [String!]
    excludedTopics: [String!]
    excludedSources: [String!]
  }
  
  input AnnotationInput {
    type: String!
    data: JSON!
    workspaceId: ID
  }
  
  input PaginationInput {
    first: Int
    after: String
    last: Int
    before: String
  }
  
  # ==================== QUERIES ====================
  
  type Query {
    # Articles
    articles(filter: ArticleFilter, limit: Int, offset: Int): [Article!]!
    articlesConnection(filter: ArticleFilter, pagination: PaginationInput): ArticleConnection!
    article(id: ID!): Article
    savedArticles(limit: Int, offset: Int): [Article!]!
    
    # Topics & Stories
    topics(limit: Int): [Topic!]!
    topic(id: ID!): Topic
    stories(limit: Int, offset: Int): [Story!]!
    story(id: ID!): Story
    trends(period: String, limit: Int): [Trend!]!
    
    # Sources
    sources(limit: Int): [Source!]!
    source(id: ID!): Source
    
    # Alerts
    alerts: [Alert!]!
    alert(id: ID!): Alert
    
    # Workspaces
    workspaces: [Workspace!]!
    workspace(id: ID!): Workspace
    
    # User
    me: User
  }
  
  # ==================== MUTATIONS ====================
  
  type Mutation {
    # Articles
    saveArticle(id: ID!): Article
    unsaveArticle(id: ID!): Boolean
    
    # Alerts
    createAlert(input: AlertInput!): Alert
    updateAlert(id: ID!, input: AlertInput!): Alert
    deleteAlert(id: ID!): Boolean
    
    # User Preferences
    updatePreferences(input: PreferencesInput!): User
    
    # Annotations
    createAnnotation(articleId: ID!, input: AnnotationInput!): Annotation
    deleteAnnotation(id: ID!): Boolean
    
    # Workspaces
    createWorkspace(name: String!, slug: String!): Workspace
    inviteToWorkspace(workspaceId: ID!, userId: ID!, role: String): Boolean
    leaveWorkspace(workspaceId: ID!): Boolean
  }
  
  # ==================== SUBSCRIPTIONS ====================
  
  type Subscription {
    articleAdded(filter: ArticleFilter): Article!
    alertTriggered: AlertTrigger!
    breakingNews: Article!
    storyUpdated(storyId: ID): Story!
  }
`;

module.exports = { typeDefs };
