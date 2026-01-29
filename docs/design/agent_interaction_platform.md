# The Agent-SVG Interaction Platform: A Visual Command Interface

## 1. The Vision: Tablet as the Director's Slate

The goal is to transform the SVG editor from a passive drawing tool into an **active command interface** for AI agents.

In this paradigm, the User (Human) acts as the **Director**, reviewing the "scene" (codebase visualization, architecture diagram) on a tablet. The Agent (AI) acts as the **Engineer/Builder**, running on the powerful workstation.

### The Workflow
1.  **Review**: User opens a diagram (e.g., `repo-division-plan-v6.svg`) on their tablet.
2.  **Annotate**: User spots an issue or an optimization. They drag a **Comment Bubble** onto the diagram:
    *   *"Refactor this cluster into a separate module."*
    *   *"Why is this dependency here?"*
3.  **Sync**: The SVG file is saved to the server.
4.  **Action**: The Agent "reads" the SVG, extracts the text from the bubble, understands the context (which node it points to), and executes the request or provides an answer.
5.  **Feedback**: The Agent updates the SVG. The bubble turns Green (Done) or Yellow (Reply attached).

## 2. Technical Architecture: SVG as Shared State

Most agent interfaces rely on chat (ephemeral, linear). This platform uses **SVG as the persistent, spatial shared state**.

### 2.1 The Comment Data Structure
Visual comments must be machine-readable. We won't just dump text; we will structure it.

**Proposed SVG Structure for Comments:**
```xml
<g class="agent-comment" data-status="pending" data-id="123">
  <!-- Visuals -->
  <rect fill="white" stroke="black" rx="10" ... />
  <text>Refactor this module</text>
  
  <!-- Connector Line (Context) -->
  <line x1="bubble_center" y1="target_node_center" stroke-dasharray="4" />
</g>
```

### 2.2 Extraction & Perception
The Agent needs a "visual cortex" tool.
*   **Input**: The raw SVG file.
*   **Process**:
    1.  Parse XML.
    2.  Find all `<g class="agent-comment">`.
    3.  Extract text content.
    4.  **Geometric Context**: Calculate what the comment is *nearest to* or *pointing at*. If the bubble is over the "Database" box, the instruction applies to the Database.
    
### 2.3 The Feedback Loop
The Agent must be able to write back to the SVG without destroying the user's view.
*   **Status Indicators**: Changing the bubble border color (Red/Green/Blue).
*   **Replies**: Appending a child `<text>` element with the agent's response.
*   **Evolution**: If the instruction was "Split this node", the Agent actually modifies the diagram geometry to split the node.

## 3. Implementation Roadmap

We will build this system in small, verified steps.

### Phase 1: The "Sticky Note" (Current Goal)
*   **Objective**: User can drag a simple visual comment bubble onto the canvas and save it.
*   **UI**: A "Add Comment" button. Creates a Group `<g>` with a `<rect>` (white bg, black border) and editable `<text>`.
*   **Interaction**: Drag text to move. Double-click to edit text (simple prompt for now).
*   **Output**: Standard SVG Elements saved to disk.

### Phase 2: The "Reader"
*   **Objective**: Extract comments from the file.
*   **Tool**: A simple script (e.g., `scripts/read_comments.js`) that:
    1.  Loads an SVG.
    2.  Finds all text elements inside "comment" groups.
    3.  Prints them to the console.
    *   *User Value*: "I can write on my tablet, step onto my PC, run a script, and see my to-do list."

### Phase 3: The "Context Aware" Connection
*   **Objective**: Link comments to specific nodes.
*   **UI**: When creating a comment, draw a line from the comment to the nearest object.
*   **Logic**: The Reader script now reports: "Comment 'Fix this' is pointing at 'UserAuthService'".

### Phase 4: The Agent Loop
*   **Objective**: The Agent actively watches the file.
*   **Workflow**:
    1.  Agent runs `watch_svg_comments`.
    2.  When a new "pending" comment appears, Agent wakes up.
    3.  Agent performs task.
    4.  Agent marks comment as "done" in the SVG.

## 4. Immediate Next Step: Phase 1 Implementation

To achieve the user's immediate request:
1.  **Add "Comment" Tool**: A button in the client UI.
2.  **Rendering**: Create the `createCommentBubble(x, y, text)` function.
    *   White background, black border, padding.
    *   Must be grouped (`<g>`) so it moves together.
3.  **Editing**: Simple `prompt()` to change text on double-click (MVP).

## 5. Agent Wake-Up Mechanisms

How does the Agent know you've left a comment? It doesn't need to "sleep" inside the file; it needs a trigger.

## 5. Agent Wake-Up Mechanisms

How does the Agent know you've left a comment? Paradoxically, an "Agent" is usually just a script at rest. It requires a spark of life—a trigger—to become active.

### The Philosophy: Push vs. Pull vs. Event Loop

*   **Pull (Polling)**: The Agent asks "Are we there yet?" every minute. Simple, but wasteful and lagging.
*   **Push (Event-Driven)**: The Environment kicks the Agent awake when something changes. Efficient and responsive.
*   **Loop (Continuous)**: The Agent never sleeps, constantly staring at the file. Expensive.

### Strategy Implementation Options

#### Strategy A: The "Server Hook" (The Direct Link)
Since we control the `docs-viewer` server, we can intercept the exact moment of creation.
*   **Mechanism**: The `POST /save` handler in the Express app triggers a callback after writing to disk.
*   **Pros**: Zero latency. The Agent wakes up *during* the save request. We can even delay the HTTP response to say "Agent is thinking...".
*   **Cons**: Tightly couples the Agent lifecycle to the Documentation Server. If the Agent crashes, the Server might stutter.

#### Strategy B: The "File Watcher" (The observer)
A separate process (like `chokidar` or `nodemon`) monitors the `docs/` filesystem.
*   **Mechanism**: OS-level file system events (`inotify`).
*   **Pros**: Totally decoupled. The Server doesn't know the Agent exists.
*   **Cons**: Can be flaky on network drives or Docker volumes. Slight race conditions possible.

#### Strategy C: The "Manual Call" (The Control Freak)
User explicitly runs a command.
*   **Mechanism**: A button in the UI hits a specific `/api/agent/run` endpoint.
*   **Pros**: Intentionality. The Agent doesn't annoy you while you are drafting.
*   **Cons**: You will forget to click it.

### Selected Approach: Strategy A (Server Hook)
We have chosen **Strategy A** for this platform.
*   **Reasoning**: We want the "Magical" experience. You write a comment, and the system reacts. Since we already have a custom plugin server (`plugins/svg-editor/server.js`), adding a hook there is the path of least resistance and highest performance.

*(Update: Strategy A proved brittle in practice. Direct process spawning on the file server caused blocking issues and deployment race conditions. Better to decouple.)*

## 6. The Distributed Architecture (Future)

The "Server Hook" (Strategy A) ran the Agent on the *File Server*. This limits the Agent's power (no GPU, limited tools). A better approach puts the Agent on a separate, powerful machine (The Brain) and connects it to the File Server (The Body).

### The Challenge: Crossing the Air Gap
How does the "Brain" (Local/Cloud) know the "Body" (Remote Server) was touched?

### Strategy E: Remote Native MCP (The Holy Grail)
The `docs-viewer` server evolves into a full **Model Context Protocol (MCP)** Server.
*   **Transport**: SSE (Server-Sent Events) over HTTP.
*   **Resources**: Exposes SVGs as readable resources `mcp://docs/v5.svg`.
*   **Tools**: Exposes `append_comment`, `highlight_node` as executable tools.
*   **Notifications**: Emits `resource/updated` events via JSON-RPC over SSE.
*   **Workflow**:
    1.  Agent connects to `https://docs-server/mcp`.
    2.  Agent subscribes to alerts.
    3.  User saves on Tablet -> Server emits `resource/updated`.
    4.  Agent receives signal instantly -> Reads Resource -> Thinks -> Calls Tool.
*   **Pros**: Standardized, clean, uses existing MCP ecosystem.
*   **Cons**: Requires implementing MCP protocol on the legacy express server.

### Strategy F: The "Event Bridge" (SSE Tunnel)
A lightweight version of E. The Remote Server just emits raw events.
*   **Remote**: Adds an endpoint `GET /api/events` (SSE). Pushes `{ event: 'save', file: '...' }`.
*   **Local**: A "Bridge" MCP Server runs locally. It connects to the Remote SSE stream.
*   **Role**: The Bridge acts as a translator. When it hears a Remote SSE, it pokes the Local Agent (via stdio/MCP).
*   **Pros**: Very easy to implement on Remote (just 10 lines of code).
*   **Cons**: Custom protocol, not standard MCP.

### Recommendation: Strategy F -> E
1.  **Immediate Fix (Strategy F)**: Add a simple SSE endpoint to `docs-viewer`. This solves the "Wake Up" problem without heavy engineering.
2.  **Long Term (Strategy E)**: Migrate `docs-viewer` to be a first-class MCP citizen.

### Implementation Status: Strategy F Complete ✅

**What Was Built:**

1.  **Remote Server** (`plugins/svg-editor/server.js`):
    *   Added `GET /api/plugins/svg-editor/stream` SSE endpoint.
    *   Maintains a `clients[]` array of connected listeners.
    *   Broadcasts `{ type: 'file_changed', file: '...' }` on every save.

2.  **Local MCP Bridge** (`scripts/docs-bridge-mcp.js`):
    *   A Node.js MCP server using `@modelcontextprotocol/sdk`.
    *   Connects to the remote SSE stream via `http.get`.
    *   Logs `🔔 Notification: Resource Updated docs://...` when events arrive.
    *   Exposes `read_resource` to fetch SVG content from the remote server.

**Verification:**
```
[Bridge] Connected to Remote Server.
[Bridge] 🔔 Notification: Resource Updated docs://design/test-ping.svg
```

### Lessons Learned

1.  **Shell Quoting Hell**: SSH + PowerShell + curl + JSON = nightmare. Use `scp` to transfer payloads instead of inline JSON.
2.  **`fetch()` Body Timeout**: Node's native `fetch` times out on long-lived SSE streams. Use `http.get` for infinite streams.
3.  **`eventsource` Package Issues**: The npm `eventsource` package had export compatibility issues. Native `http` is more robust.
4.  **Path Relativity**: The server's `docsPath` is already the `docs/` folder. Don't prepend `docs/` in the client payload.
5.  **Decouple First**: Strategy A (Server Hook with `spawn`) seemed simple but created tight coupling and blocking. Strategy F (SSE Bridge) is cleaner.

## 7. Context Linking (Phase 4) ✅

Comments are now automatically linked to the nearest SVG element.

### Implementation

**Client-Side (`client.js`):**
1.  `findNearestElement(x, y)`: Finds the closest `<g>` element (with an ID) to a given point. Excludes comments and agent responses.
2.  `getElementCenter(el)`: Calculates the center point of an element, accounting for transforms.
3.  `createCommentBubble()`: Updated to:
    *   Call `findNearestElement()` on creation.
    *   Store target ID in `data-target` attribute.
    *   Draw a dashed `<line>` connector from the comment to the target.

**Server-Side (`read_svg_comments.js`):**
*   Now extracts the `data-target` attribute.
*   Output includes `🔗 Linked to: <target_id>`.

### Example Output
```
💬 "Refactor this module"
   @ (500, 300) - ID: c_1768907587233
   🔗 Linked to: DatabaseService
----------------------------------------
```

### What's Next?
*   **Phase 5: The Agent Loop**: Active processing of comments by the AI.
*   **Connector Updates**: Update line position when comment is dragged.

## 8. The Agent Loop (Phase 5)

The final piece: How does the AI automatically "wake up" and process new comments?

### The Gap
Currently:
1.  User saves → SSE broadcasts → Bridge logs notification.
2.  **Nothing happens.** The AI doesn't know.

### Solution: MCP Sampling

MCP has a powerful feature called **Sampling** where servers can *request* LLM completions from the client.

```
[MCP Server] --sampling/createMessage--> [MCP Client (Antigravity)]
                                              |
                                              v
                                        [LLM Generates]
                                              |
                                              v
                                        [Response to Server]
```

### Architecture

1.  **On SSE Event**: Bridge detects `file_changed`.
2.  **Fetch & Parse**: Bridge fetches SVG, extracts new/pending comments.
3.  **Sampling Request**: Bridge sends `sampling/createMessage` to client:
    ```json
    {
      "method": "sampling/createMessage",
      "params": {
        "messages": [{
          "role": "user",
          "content": {
            "type": "text",
            "text": "New SVG comment detected:\n\nFile: repo-division-plan-v5.svg\nComment: 'Refactor this module'\nLinked To: DatabaseService\n\nPlease analyze and act."
          }
        }],
        "maxTokens": 1000
      }
    }
    ```
4.  **LLM Processes**: Antigravity (the host) runs this through its LLM.
5.  **Response**: The LLM's response is returned to the Bridge.
6.  **Action**: Bridge can log, write response to SVG, or take further action.

### Alternative: File-Based Task Queue

If Sampling isn't supported by the host, a simpler fallback:

1.  **On SSE Event**: Bridge writes to `.agent/pending_comments.md`.
2.  **Workflow Hook**: The user's workflow (or AGENTS.md rule) tells the AI: "Check `.agent/pending_comments.md` at the start of each session."
3.  **AI Processes**: Reads pending, acts, marks as done.

### Implementation Plan

| Step | Component | Description |
|------|-----------|-------------|
| 1 | `docs-bridge-mcp.js` | Add sampling capability to server declaration |
| 2 | `docs-bridge-mcp.js` | On SSE, fetch SVG, parse comments |
| 3 | `docs-bridge-mcp.js` | Call `server.createMessage()` with constructed prompt |
| 4 | Antigravity | Ensure host supports sampling (may need config) |
| 5 | Verification | User saves → AI responds automatically |

### Fallback: AGENTS.md Instruction

If sampling isn't feasible, add this to `AGENTS.md`:

```markdown
## SVG Comment Monitoring

At the start of each session:
1. Check if `docs-bridge` MCP server is connected.
2. Call `list_resources` on `docs-bridge`.
3. For any SVG resources, call `read_resource` and parse for pending comments.
4. Process any comments as user instructions.
```

## 9. Visual Feedback (The Agent Writes Back)

The AI can update the SVG to indicate progress. This closes the feedback loop: Human → Comment → AI → Visual Change.

### Available Tools

The `docs-bridge` MCP server exposes three tools:

| Tool | Description | Use Case |
|------|-------------|----------|
| `mark_comment_done` | Changes comment border to green | Task completed |
| `update_element_style` | Changes fill/stroke/opacity of any element | Progress indication, highlighting |
| `add_agent_reply` | Appends agent response text to comment | Answering questions |

### Example: Mark Comment Done

```json
{
  "tool": "mark_comment_done",
  "arguments": {
    "file": "design/repo-division-plan-v5.svg",
    "commentId": "c_1768907587233"
  }
}
```
Result: The comment bubble's border turns green ✅.

### Example: Shade a Completed Box

```json
{
  "tool": "update_element_style",
  "arguments": {
    "file": "design/repo-division-plan-v5.svg",
    "elementId": "DatabaseService",
    "fill": "#90EE90"
  }
}
```
Result: The "DatabaseService" box turns light green 🎨.

### Example: Reply to a Question

```json
{
  "tool": "add_agent_reply",
  "arguments": {
    "file": "design/repo-division-plan-v5.svg",
    "commentId": "c_1768907587233",
    "reply": "Refactoring complete. See commit abc123."
  }
}
```
Result: The comment shows "🤖 Refactoring complete..." 💬.

### Color Conventions

| Status | Color | Hex |
|--------|-------|-----|
| Pending | Black border | `#000000` |
| In Progress | Blue border | `#3b82f6` |
| Done | Green border/fill | `#22c55e` / `#90EE90` |
| Blocked | Red border | `#ef4444` |
| Question | Yellow fill | `#fef3c7` |
