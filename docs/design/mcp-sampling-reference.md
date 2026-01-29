# MCP Sampling API Reference

**Protocol Version:** 2.0 (Model Context Protocol)
**Official Documentation:** [modelcontextprotocol.io](https://modelcontextprotocol.io)

## Overview

The **Sampling API** allows an MCP Server (e.g., your bridge script) to request the MCP Client (Antigravity/Host) to generate a completion using a Large Language Model (LLM). This effectively allows servers to "wake up" the agent and initiate workflows.

## Capability Handshake

To use sampling, the Client must state it supports it during initialization, and the Server must check for it.

**Client Capabilities (sent on init):**
```json
{
  "capabilities": {
    "sampling": {} 
  }
}
```

## Method: `sampling/createMessage`

The server sends a JSON-RPC request to the client.

### Request

**Method:** `sampling/createMessage`

**Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `SamplingMessage[]` | **Required.** The conversation history to send to the model. |
| `systemPrompt` | `string` | Optional system instruction. |
| `includeContext` | `string` | `"none"`, `"thisServer"`, or `"allServers"`. Default `"none"`. |
| `temperature` | `number` | 0.0 to 1.0. |
| `maxTokens` | `integer` | Maximum tokens to generate. |
| `stopSequences` | `string[]` | Sequences to stop generation at. |
| `modelPreferences` | `ModelPreferences` | Hints for model selection. |

### Data Structures

#### `SamplingMessage`
Similar to OpenAI's message format.
```json
{
  "role": "user" | "assistant",
  "content": {
    "type": "text" | "image",
    "text": "The prompt content...",
    "data": "base64..." (for images)
  }
}
```

#### `ModelPreferences`
Hints to help the client choose the best model.
```json
{
  "hints": [
    { "name": "claude-3-5-sonnet" },
    { "name": "gpt-4" }
  ],
  "costPriority": 0.0 to 1.0,    // Low = cheap, High = expensive ok
  "speedPriority": 0.0 to 1.0,   // Low = slow ok, High = fast
  "intelligencePriority": 0.0 to 1.0 // Low = dumb ok, High = smart
}
```

### Response

The client sends back a completion result.

```json
{
  "role": "assistant",
  "content": {
    "type": "text",
    "text": "The generated response from the AI..."
  },
  "model": "claude-3-5-sonnet-20240620", // The actual model used
  "stopReason": "end_turn"
}
```

## Example Trace

**1. Server sends request:**
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "method": "sampling/createMessage",
  "params": {
    "messages": [
      { 
        "role": "user", 
        "content": { "type": "text", "text": "Analyze this error log..." } 
      }
    ],
    "maxTokens": 1000,
    "modelPreferences": {
      "intelligencePriority": 0.9
    }
  }
}
```

**2. Client processes request:**
*   Checks if user allows sampling.
*   Selects default high-intelligence model (e.g. Gemini Pro, GPT-4).
*   Calls LLM API.

**3. Client sends response:**
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "result": {
    "role": "assistant",
    "content": {
      "type": "text",
      "text": "The error log indicates a timeout in..."
    },
    "model": "gemini-1.5-pro",
    "stopReason": "end_turn"
  }
}
```

## Libraries

*   **Node.js SDK:** `@modelcontextprotocol/sdk`
    *   `server.createMessage(request)`
*   **Python SDK:** `mcp`
    *   `server.create_message(request)`
