# Crawl Sequence Command AST — Design Brief

**Status:** Draft (November 4, 2025)
**Owner:** GitHub Copilot

## 1. Objective

This document outlines the design for a structured Abstract Syntax Tree (AST) to define and execute crawl sequences. The primary goal is to create a precise, concise, and declarative language for expressing high-level crawler behavior, separating the *what* (the crawl strategy) from the *how* (the implementation details within the crawler engine).

This AST will serve as the foundation for configuration-as-code, enabling crawl strategies to be version-controlled, reviewed, and modified with clarity and safety. It directly addresses historical challenges where the monolithic nature of the crawler made it difficult for AI agents and human developers to implement specific behavioral changes without deep system knowledge.

## 2. Motivation

The current methods for orchestrating crawls rely on either:
1.  A complex web of CLI flags that are difficult to compose.
2.  Hard-coded methods within the `CrawlOperations` facade.
3.  A proposed simple array of command strings.

While the simple string array is a good first step, it lacks the expressiveness needed for non-trivial workflows (e.g., passing arguments, conditional execution). An AST provides a clear path forward, allowing us to start simple and introduce more powerful constructs as required, without fundamentally changing the execution model.

By treating crawl plans as data (an AST), we enable:
-   **Clarity:** Crawl logic becomes easy to read and understand.
-   **Safety:** Sequences can be statically validated against a schema before execution.
-   **Maintainability:** Changes are localized to configuration files, not imperative code.
-   **Agent-Friendliness:** AI agents can more reliably generate or modify structured JSON/YAML than manipulate complex JavaScript.

## 3. Core Design: From Simple Strings to a Full AST

The design proposes a two-stage evolution, starting with a simple, backward-compatible structure that can gracefully evolve into a more powerful AST.

### Stage 1: Simple Command Sequences (v1)

This is the immediate implementation target. It supports a simple array of commands, where each command can be a plain string (for no-argument operations) or an object (for operations with arguments).

#### Schema v1
A sequence is a JSON array. Each element is either a `string` or a `CommandNode` object.

-   **`string`:** Represents a command with no arguments.
    ```json
    "ensurePlaceHubs"
    ```
-   **`CommandNode` (object):** Represents a command with arguments.
    -   `command` (string, required): The name of the operation to execute. Must match a registered method on the `CrawlOperations` facade.
    -   `args` (object, optional): A key-value map of arguments to pass to the command.

#### Example v1 Sequence (`simple-us-exploration.json`)
```json
[
  "ensureCountryHubs",
  {
    "command": "exploreCountryHubs",
    "args": {
      "country": "US",
      "limit": 100
    }
  },
  "findTopicHubs"
]
```

The `sequenceConfigLoader` will parse this array. For each item, it will:
1.  If it's a string, invoke the corresponding no-argument method on `CrawlOperations`.
2.  If it's an object, invoke the method specified by `command`, passing the `args` object as its payload.

This provides immediate utility and a clear migration path.

### Stage 2: Advanced AST with Control Flow (v2 - Design Only)

This stage is for future planning and **will not be implemented yet**. It introduces new node types to enable advanced scripting capabilities like conditionals, loops, and error handling. When the limitations of the v1 format are reached, this design will provide a ready blueprint for the next evolution.

#### Proposed AST v2 Node Types

-   **`SequenceNode` (replaces root array):**
    -   `type`: "Sequence"
    -   `steps`: An array of other nodes (`CommandNode`, `ConditionalNode`, etc.).
-   **`CommandNode` (as before):**
    -   `type`: "Command"
    -   `command`: string
    -   `args`: object
-   **`ConditionalNode`:**
    -   `type`: "Conditional"
    -   `if`: A condition expression (e.g., a string to be evaluated by a simple expression engine).
    -   `then`: An array of nodes to execute if the condition is true.
    -   `else`: (Optional) An array of nodes to execute if false.
-   **`ForEachNode`:**
    -   `type`: "ForEach"
    -   `each`: The name of a variable to iterate over (e.g., from the output of a previous step).
    -   `as`: The name to bind each item to within the loop.
    -   `do`: An array of nodes to execute for each item.

#### Example v2 Sequence
This example demonstrates finding hubs for all G7 countries, but only exploring topic hubs if the initial place hub discovery was successful.

```json
{
  "type": "Sequence",
  "steps": [
    {
      "type": "ForEach",
      "each": "context.g7_countries",
      "as": "country",
      "do": [
        {
          "type": "Command",
          "command": "ensurePlaceHubs",
          "args": { "country": "{{country.code}}" }
        }
      ]
    },
    {
      "type": "Conditional",
      "if": "results.step1.status === 'success'",
      "then": [
        {
          "type": "Command",
          "command": "findTopicHubs",
          "args": { "minConfidence": 0.8 }
        }
      ]
    }
  ]
}
```

## 4. Integration with Crawler Architecture

-   **Loader (`sequenceConfigLoader.js`):** This module will be responsible for reading YAML/JSON files, validating them against the current schema (v1 initially), and parsing them into an executable format. It will handle the backward compatibility of simple strings.
-   **Runner (`SequenceRunner.js`):** The runner will consume the parsed sequence. In v1, it will simply iterate the array and invoke methods on the `CrawlOperations` facade. In v2, it would become a true AST interpreter, walking the node tree and executing logic based on node types.
-   **Facade (`CrawlOperations.js`):** The facade's role remains unchanged. It exposes the atomic, high-level operations (like `ensurePlaceHubs`) that the AST commands map to. The AST is the "script," and the facade is the "API" that the script calls.

This architecture ensures that the core crawler logic remains cleanly separated from the high-level orchestration, achieving the project's primary refactoring goal.

## 5. Validation and Error Handling

To ensure the AST sequences are robust and safe to execute, the following validation and error handling mechanisms will be implemented:

### Schema Validation
- **JSON Schema Enforcement**: Each sequence file will be validated against a JSON Schema that defines the structure for v1 and v2 AST nodes. This includes type checking, required fields, and allowed values.
- **Pre-Execution Validation**: Before parsing or executing a sequence, the `sequenceConfigLoader` will validate the input against the schema. Invalid sequences will be rejected with detailed error messages indicating the specific validation failure.
- **Version Compatibility**: The loader will detect the AST version (v1 or v2) and apply the appropriate schema validation rules.

### Error Handling in Execution
- **Graceful Degradation**: If a command in a sequence fails, the runner will log the error, skip to the next command, and continue execution where possible. Critical failures (e.g., invalid command names) will halt execution.
- **Detailed Error Reporting**: Errors will include context such as the sequence file, line number, command index, and specific failure reason. This aids in debugging and sequence refinement.
- **Recovery Mechanisms**: For recoverable errors (e.g., network timeouts), the runner may implement retry logic with exponential backoff.

### Runtime Safety Checks
- **Command Existence Validation**: Before executing a command, verify that the specified method exists on the `CrawlOperations` facade.
- **Argument Type Validation**: Ensure arguments passed to commands match expected types (e.g., strings for URLs, numbers for limits).
- **Resource Limits**: Implement execution timeouts and resource usage monitoring to prevent runaway sequences.

## 6. Metrics and Telemetry

To provide visibility into sequence execution and enable optimization, comprehensive metrics and telemetry will be integrated:

### Execution Metrics
- **Performance Tracking**: Record execution time for each command and the overall sequence. Track success/failure rates and identify performance bottlenecks.
- **Command Usage Statistics**: Monitor which commands are used most frequently and their typical execution times.
- **Sequence Completion Rates**: Track how often sequences complete successfully versus partial failures.

### Telemetry Integration
- **Existing Telemetry System**: Leverage the project's existing telemetry infrastructure (SSE events, background task logging) to emit sequence-related events.
- **Structured Logging**: Log sequence start/end events, command executions, and errors in a structured format compatible with the current logging system.
- **Background Task Integration**: Since sequences may run as background tasks, integrate with `BackgroundTaskManager` to provide progress updates and status reporting.

### Observability Features
- **Sequence Dashboards**: Extend the `/analysis` page or create a dedicated `/sequences` page to display sequence execution history, metrics, and active runs.
- **Real-time Monitoring**: Use SSE to broadcast sequence progress in real-time, similar to crawl and background task monitoring.
- **Audit Trails**: Maintain logs of sequence executions, including input parameters, execution results, and any modifications made to the database.

## 7. Integration with Existing Systems

The AST will be designed to integrate seamlessly with the existing crawler architecture and tooling:

### CrawlOperations Facade Integration
- **Command Mapping**: Each AST command will map directly to a method on the `CrawlOperations` facade, ensuring consistency with existing code.
- **Backward Compatibility**: The facade will continue to support direct method calls, allowing gradual migration to AST-based sequences.
- **Extension Points**: New commands can be added to the facade and automatically become available in AST sequences.

### CLI Tool Integration
- **Sequence Execution CLI**: Create a new CLI tool (`tools/crawl-sequence.js`) that can load and execute AST sequences, with options for dry-run, verbose output, and progress monitoring.
- **Configuration Management**: Integrate with the existing configuration system (e.g., `config/priority-config.json`) to allow sequences to reference shared settings.
- **Error Reporting**: Use the established CLI formatting tools (`CliFormatter`, `CliArgumentParser`) for consistent output and error messages.

### Database and Background Task Integration
- **Database Adapters**: Sequences that interact with the database will use the existing adapter layers, ensuring consistency with current data access patterns.
- **Background Task Support**: Sequences can be executed as background tasks, leveraging `BackgroundTaskManager` for scheduling, progress tracking, and persistence.
- **Queue Integration**: For sequences involving crawling, integrate with the queue system to manage URL discovery and processing.

## 8. Safety Features

To prevent unintended consequences and ensure reliable execution:

### Dry-Run Mode
- **Execution Simulation**: Support a dry-run mode that validates the sequence and simulates execution without making actual changes to the database or external systems.
- **Impact Assessment**: During dry-run, report what actions would be taken, including database queries, file operations, and external API calls.
- **Validation Without Side Effects**: Ensure dry-run performs all validation checks but avoids any persistent changes.

### Execution Limits
- **Timeout Protection**: Implement configurable timeouts for sequence execution to prevent hanging processes.
- **Resource Quotas**: Limit the number of concurrent operations, database connections, or external requests to prevent resource exhaustion.
- **Circuit Breaker Pattern**: For sequences involving external services, implement circuit breakers to fail fast during outages.

### Access Control
- **Command Whitelisting**: Only allow execution of predefined commands to prevent arbitrary code execution.
- **Environment Isolation**: Ensure sequences run in a controlled environment with limited access to system resources.
- **Audit Logging**: Maintain detailed logs of all sequence executions for security and debugging purposes.

## 9. Examples and Documentation

### Additional Examples

#### v1 Simple Sequence with Error Handling
```json
[
  "ensureCountryHubs",
  {
    "command": "exploreCountryHubs",
    "args": {
      "country": "US",
      "limit": 100,
      "timeout": 30000
    }
  },
  "findTopicHubs"
]
```

#### v2 Advanced Sequence with Conditionals
```json
{
  "type": "Sequence",
  "steps": [
    {
      "type": "Command",
      "command": "ensurePlaceHubs",
      "args": { "country": "US" }
    },
    {
      "type": "Conditional",
      "if": "results.lastCommand.success && results.lastCommand.hubCount > 10",
      "then": [
        {
          "type": "Command",
          "command": "findTopicHubs",
          "args": { "minConfidence": 0.8 }
        }
      ],
      "else": [
        {
          "type": "Command",
          "command": "logWarning",
          "args": { "message": "Insufficient hubs found, skipping topic discovery" }
        }
      ]
    }
  ]
}
```

### CLI Usage Examples
```bash
# Validate a sequence without executing
node tools/crawl-sequence.js --file sequences/us-exploration.json --validate

# Execute a sequence with progress monitoring
node tools/crawl-sequence.js --file sequences/us-exploration.json --execute --progress

# Dry-run a sequence to see what would happen
node tools/crawl-sequence.js --file sequences/us-exploration.json --dry-run

# Execute as a background task
node tools/crawl-sequence.js --file sequences/us-exploration.json --background
```

### Documentation Structure
- **AST Reference Guide**: Complete documentation of all node types, their properties, and validation rules.
- **Command Reference**: Detailed documentation for each available command, including parameters, return values, and error conditions.
- **Migration Guide**: Instructions for converting existing hardcoded crawl logic to AST sequences.
- **Best Practices**: Guidelines for writing maintainable, efficient sequences.
- **Troubleshooting**: Common issues and their solutions.

This enhanced AST design provides a powerful, safe, and observable foundation for declarative crawl behavior definition, enabling precise and concise changes to crawler logic while maintaining full integration with existing systems.
