'use strict';

/**
 * GraphQL Setup and Middleware
 * @module api/graphql
 */

const { typeDefs } = require('./schema');
const { createResolvers } = require('./resolvers');
const { DataLoader, createLoaders, createSavedArticleLoader } = require('./dataloaders');
const { 
  PubSub, 
  TOPICS, 
  createSubscriptionResolvers, 
  connectToEventBroadcaster 
} = require('./subscriptions');

/**
 * Simple GraphQL execution engine
 * Used when graphql package is not installed
 */
class SimpleGraphQL {
  constructor(schema, resolvers, context) {
    this.schema = schema;
    this.resolvers = resolvers;
    this.context = context;
  }

  async execute(query, variables = {}) {
    // Parse the query to extract operation type and fields
    const operation = this.parseQuery(query);
    
    if (!operation) {
      return { errors: [{ message: 'Invalid query' }] };
    }

    try {
      const data = await this.resolveOperation(operation, variables);
      return { data };
    } catch (error) {
      return { 
        data: null, 
        errors: [{ message: error.message }] 
      };
    }
  }

  parseQuery(query) {
    // Simple query parser - extracts operation type and field selections
    const queryMatch = query.match(/^\s*(query|mutation|subscription)?\s*(\w+)?\s*(\([^)]*\))?\s*\{([^}]+)\}/s);
    
    if (!queryMatch) {
      // Try to parse as shorthand query
      const shorthandMatch = query.match(/^\s*\{([^}]+)\}/s);
      if (shorthandMatch) {
        return {
          type: 'query',
          name: null,
          selections: this.parseSelections(shorthandMatch[1])
        };
      }
      return null;
    }

    return {
      type: queryMatch[1] || 'query',
      name: queryMatch[2],
      variables: queryMatch[3],
      selections: this.parseSelections(queryMatch[4])
    };
  }

  parseSelections(selectionsStr) {
    const selections = [];
    const fieldRegex = /(\w+)(?:\s*\(([^)]*)\))?\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\})?/g;
    
    let match;
    while ((match = fieldRegex.exec(selectionsStr)) !== null) {
      selections.push({
        name: match[1],
        arguments: this.parseArguments(match[2] || ''),
        selections: match[3] ? this.parseSelections(match[3]) : null
      });
    }
    
    return selections;
  }

  parseArguments(argsStr) {
    if (!argsStr.trim()) return {};
    
    const args = {};
    const argRegex = /(\w+)\s*:\s*("[^"]*"|\d+|true|false|\$\w+|\{[^}]*\}|\[[^\]]*\])/g;
    
    let match;
    while ((match = argRegex.exec(argsStr)) !== null) {
      let value = match[2];
      
      // Parse the value
      if (value.startsWith('"')) {
        value = value.slice(1, -1);
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (!isNaN(value)) {
        value = Number(value);
      } else if (value.startsWith('$')) {
        // Variable reference - will be resolved later
        value = { __variable: value.slice(1) };
      }
      
      args[match[1]] = value;
    }
    
    return args;
  }

  async resolveOperation(operation, variables) {
    const resolverType = operation.type.charAt(0).toUpperCase() + operation.type.slice(1);
    const typeResolvers = this.resolvers[resolverType];
    
    if (!typeResolvers) {
      throw new Error(`No resolvers for ${resolverType}`);
    }

    const result = {};
    
    for (const selection of operation.selections) {
      const resolver = typeResolvers[selection.name];
      
      if (!resolver) {
        throw new Error(`No resolver for ${resolverType}.${selection.name}`);
      }

      // Resolve variable references in arguments
      const args = this.resolveVariables(selection.arguments, variables);
      
      // Call the resolver
      const value = await resolver(null, args, this.context);
      
      // If there are sub-selections and the value is an object, resolve those too
      if (selection.selections && value) {
        result[selection.name] = await this.resolveSelections(value, selection.selections, selection.name);
      } else {
        result[selection.name] = value;
      }
    }

    return result;
  }

  resolveVariables(args, variables) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(args)) {
      if (value && typeof value === 'object' && value.__variable) {
        resolved[key] = variables[value.__variable];
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }

  async resolveSelections(parent, selections, typeName) {
    if (Array.isArray(parent)) {
      return Promise.all(parent.map(item => this.resolveSelections(item, selections, typeName)));
    }

    const result = {};
    
    for (const selection of selections) {
      const value = parent[selection.name];
      
      // Check for type resolver
      const typeResolvers = this.resolvers[this.guessTypeName(typeName)];
      const fieldResolver = typeResolvers?.[selection.name];
      
      if (fieldResolver && typeof fieldResolver === 'function') {
        result[selection.name] = await fieldResolver(parent, {}, this.context);
      } else if (selection.selections && value) {
        result[selection.name] = await this.resolveSelections(value, selection.selections, selection.name);
      } else {
        result[selection.name] = value;
      }
    }
    
    return result;
  }

  guessTypeName(fieldName) {
    // Map field names to type names
    const typeMap = {
      articles: 'Article',
      article: 'Article',
      topics: 'Topic',
      topic: 'Topic',
      stories: 'Story',
      story: 'Story',
      sources: 'Source',
      source: 'Source',
      me: 'User',
      workspaces: 'Workspace',
      workspace: 'Workspace'
    };
    
    return typeMap[fieldName] || fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  }
}

/**
 * Setup GraphQL for Express app
 * @param {Object} app - Express app
 * @param {Object} services - Service instances
 * @param {Object} [options] - Options
 * @returns {Object} GraphQL setup result
 */
function setupGraphQL(app, services, options = {}) {
  const pubsub = new PubSub();
  
  // Connect to EventBroadcaster if available
  if (services.eventBroadcaster) {
    connectToEventBroadcaster(pubsub, services.eventBroadcaster);
  }

  // Create resolvers
  const queryResolvers = createResolvers(services);
  const subscriptionResolvers = createSubscriptionResolvers(pubsub);
  
  const resolvers = {
    ...queryResolvers,
    ...subscriptionResolvers
  };

  // GraphQL endpoint
  app.post('/api/graphql', async (req, res) => {
    try {
      const { query, variables, operationName } = req.body;
      
      if (!query) {
        return res.status(400).json({ errors: [{ message: 'Query is required' }] });
      }

      // Create context with loaders
      const loaders = createLoaders(services);
      const context = {
        user: req.user,
        loaders,
        services,
        pubsub
      };
      
      // Add user-specific loader if authenticated
      if (req.user) {
        context.savedArticleLoader = createSavedArticleLoader(req.user.id, services);
      }

      // Execute query
      const graphql = new SimpleGraphQL(typeDefs, resolvers, context);
      const result = await graphql.execute(query, variables || {});
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        errors: [{ message: error.message }] 
      });
    }
  });

  // GraphQL GET endpoint (for simple queries)
  app.get('/api/graphql', async (req, res) => {
    const query = req.query.query;
    const variables = req.query.variables ? JSON.parse(req.query.variables) : {};
    
    if (!query) {
      return res.status(400).json({ errors: [{ message: 'Query is required' }] });
    }

    const loaders = createLoaders(services);
    const context = {
      user: req.user,
      loaders,
      services,
      pubsub
    };
    
    if (req.user) {
      context.savedArticleLoader = createSavedArticleLoader(req.user.id, services);
    }

    const graphql = new SimpleGraphQL(typeDefs, resolvers, context);
    const result = await graphql.execute(query, variables);
    
    res.json(result);
  });

  // GraphQL Playground (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/graphql/playground', (req, res) => {
      res.send(getPlaygroundHTML('/api/graphql'));
    });
  }

  return { 
    pubsub, 
    resolvers,
    TOPICS,
    typeDefs
  };
}

/**
 * Get GraphQL Playground HTML
 * @param {string} endpoint - GraphQL endpoint
 * @returns {string} HTML
 */
function getPlaygroundHTML(endpoint) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GraphQL Playground</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #e94560;
      margin-bottom: 10px;
    }
    .subtitle {
      color: #888;
      margin-bottom: 30px;
    }
    .editor {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
    }
    .panel {
      flex: 1;
      background: #16213e;
      border-radius: 8px;
      padding: 15px;
    }
    .panel h3 {
      margin-top: 0;
      color: #e94560;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    textarea {
      width: 100%;
      height: 300px;
      background: #0f0f23;
      border: 1px solid #333;
      border-radius: 4px;
      color: #eee;
      font-family: "Monaco", "Menlo", monospace;
      font-size: 13px;
      padding: 10px;
      resize: vertical;
    }
    pre {
      background: #0f0f23;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 10px;
      overflow: auto;
      max-height: 300px;
      font-size: 13px;
    }
    button {
      background: #e94560;
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
      margin-bottom: 20px;
    }
    button:hover {
      background: #ff6b6b;
    }
    button:disabled {
      background: #666;
      cursor: not-allowed;
    }
    .examples {
      margin-top: 30px;
    }
    .example {
      background: #16213e;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      cursor: pointer;
    }
    .example:hover {
      background: #1a2540;
    }
    .example h4 {
      margin: 0 0 5px 0;
      color: #e94560;
    }
    .example code {
      color: #888;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 GraphQL Playground</h1>
    <p class="subtitle">NewsCrawl GraphQL API Explorer</p>
    
    <div class="editor">
      <div class="panel">
        <h3>Query</h3>
        <textarea id="query" placeholder="Enter your GraphQL query here...">{
  articles(limit: 5) {
    id
    title
    url
    sentiment {
      score
      label
    }
    topics {
      name
    }
  }
}</textarea>
      </div>
      <div class="panel">
        <h3>Variables</h3>
        <textarea id="variables" placeholder="{ }">{}</textarea>
      </div>
    </div>
    
    <button id="execute" onclick="executeQuery()">▶ Execute Query</button>
    
    <div class="panel">
      <h3>Response</h3>
      <pre id="response">Click "Execute Query" to see results...</pre>
    </div>
    
    <div class="examples">
      <h3>Example Queries</h3>
      
      <div class="example" onclick="loadExample('articles')">
        <h4>📰 List Articles</h4>
        <code>Fetch recent articles with sentiment and topics</code>
      </div>
      
      <div class="example" onclick="loadExample('topics')">
        <h4>🏷️ List Topics</h4>
        <code>Get all topics with article counts</code>
      </div>
      
      <div class="example" onclick="loadExample('stories')">
        <h4>📖 List Stories</h4>
        <code>Get story clusters with perspectives</code>
      </div>
      
      <div class="example" onclick="loadExample('me')">
        <h4>👤 Current User</h4>
        <code>Get authenticated user info (requires auth)</code>
      </div>
    </div>
  </div>
  
  <script>
    const endpoint = '${endpoint}';
    
    const examples = {
      articles: \`{
  articles(limit: 10, filter: { sentiment: "positive" }) {
    id
    title
    url
    publishedAt
    sentiment {
      score
      label
      entities {
        entity
        score
      }
    }
    topics {
      id
      name
      confidence
    }
    source {
      name
      domain
      credibility
    }
  }
}\`,
      topics: \`{
  topics(limit: 20) {
    id
    name
    slug
    articleCount
  }
}\`,
      stories: \`{
  stories(limit: 5) {
    id
    title
    articleCount
    articles {
      id
      title
      source {
        name
      }
    }
    perspectives {
      tone
      summary
      source {
        name
        bias
      }
    }
  }
}\`,
      me: \`{
  me {
    id
    email
    name
    preferences {
      topics
      sources
    }
    subscription {
      plan
      status
    }
  }
}\`
    };
    
    function loadExample(name) {
      document.getElementById('query').value = examples[name];
      document.getElementById('variables').value = '{}';
    }
    
    async function executeQuery() {
      const query = document.getElementById('query').value;
      const variablesStr = document.getElementById('variables').value;
      const responseEl = document.getElementById('response');
      const button = document.getElementById('execute');
      
      let variables = {};
      try {
        variables = JSON.parse(variablesStr);
      } catch (e) {
        responseEl.textContent = 'Invalid JSON in variables';
        return;
      }
      
      button.disabled = true;
      button.textContent = '⏳ Loading...';
      
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables })
        });
        
        const data = await response.json();
        responseEl.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        responseEl.textContent = 'Error: ' + error.message;
      } finally {
        button.disabled = false;
        button.textContent = '▶ Execute Query';
      }
    }
  </script>
</body>
</html>
  `.trim();
}

module.exports = { 
  setupGraphQL, 
  SimpleGraphQL,
  getPlaygroundHTML,
  // Re-export components
  typeDefs,
  createResolvers,
  createLoaders,
  createSavedArticleLoader,
  DataLoader,
  PubSub,
  TOPICS,
  createSubscriptionResolvers,
  connectToEventBroadcaster
};
