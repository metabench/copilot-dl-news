# JSGUI3 Client

ES6 JSGUI Client library for delivery to the browser. This module provides client-side functionality for building web applications with the JSGUI framework.

## Overview

The `jsgui3-client` package extends the base `jsgui3-html` framework with browser-specific functionality, including HTTP communication, client resource management, page context handling, and UI controls optimized for client-side execution.

## Features

### HTTP Communication
- **GET, POST, DELETE requests**: Built-in HTTP methods with Promise/callback support
- **Automatic JSON handling**: Serialization and parsing of JSON data
- **Timeout support**: Configurable request timeouts (default: 2500ms)
- **Error handling**: Comprehensive status code and error response handling

### Resource Management
- **Client Resource Pool**: Manages client-side resources with HTTP endpoint connectivity
- **Data Resources**: HTTP-based data resources with GET/POST/DELETE operations
- **Resource Registration**: Server resource registration and management

### Page Context
- **Client Page Context**: Extended page context class with browser-specific features
- **Modal Support**: Built-in modal dialog functionality
- **Element Management**: DOM element mapping and control
- **Control Integration**: Seamless integration with JSGUI controls

### Controls
- **Active HTML Document**: Enhanced HTML document control with automatic activation
- **Standard Control Updates**: Automatic control registration and updates

## Installation

```bash
npm install jsgui3-client
```

## Dependencies

- **jsgui3-html**: ^0.0.163 - Core JSGUI HTML framework
- **fnl**: 0.0.36 - Functional library utilities

## Requirements

- Node.js >= 15.0.0

## Main Components

### `client.js`
Main entry point that sets up the global `jsgui` object with client-specific functionality including HTTP methods and resource management.

### `resource.js`
Defines client-side resources that can communicate with server endpoints via HTTP.

### `client-resource-pool.js`
Manages pools of client resources, extending the base resource pool with client-specific capabilities.

### `page-context.js`
Provides `Client_Page_Context` class that extends the base page context with browser-specific features like modals and DOM management.

### `data-get-post-delete-http-resource.js`
Implements HTTP-based data resources supporting standard CRUD operations over HTTP.

### `controls/Active_HTML_Document.js`
An enhanced HTML document control that automatically activates when instantiated.

## Usage

```javascript
// The library automatically extends the global jsgui object when loaded
const jsgui = require('jsgui3-client');

// HTTP requests
jsgui.http('/api/data').then(data => {
    console.log('Retrieved data:', data);
});

// POST data
jsgui.http_post('/api/data', {name: 'example'}).then(response => {
    console.log('Posted successfully:', response);
});

// Create page context
const context = new jsgui.Client_Page_Context({
    document: document
});

// Use modal
context.modal.show('Hello World!');
```

## Architecture

This module is designed to work in browser environments and provides the client-side counterpart to `jsgui3-server`. It handles:

- Browser-specific DOM operations
- HTTP communication with server resources
- Client-side resource pooling and management
- UI controls optimized for browser execution

## License

MIT

## Author

James Vickers <james@metabench.com>

## Repository

https://github.com/metabench/jsgui3-client.git