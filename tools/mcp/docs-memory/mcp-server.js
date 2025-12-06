#!/usr/bin/env node
"use strict";

/**
 * MCP Server for docs-memory (stdio transport)
 * 
 * Exposes AGI documentation as MCP tools:
 * 
 * READ tools:
 * - docs_memory_getSelfModel: Read SELF_MODEL.md
 * - docs_memory_getLessons: Read LESSONS.md excerpts
 * - docs_memory_getSession: Read session files (latest or by slug)
 * - docs_memory_listSessions: List available sessions
 * - docs_memory_searchSessions: Search across all session files
 * - docs_memory_getWorkflow: Read workflow definitions with structured metadata
 * - docs_memory_listWorkflows: List available workflows
 * 
 * WRITE tools:
 * - docs_memory_appendLessons: Add new lesson to LESSONS.md
 * - docs_memory_appendToSession: Append to WORKING_NOTES or FOLLOW_UPS
 * - docs_memory_proposeWorkflowImprovement: Suggest workflow optimization (AGI self-improvement)
 * 
 * Usage:
 *   node mcp-server.js          # Run as MCP server (stdio)
 *   node mcp-server.js --http   # Run as HTTP server (port 4399)
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

const repoRoot = path.join(__dirname, "..", "..", "..");
const selfModelPath = path.join(repoRoot, "docs", "agi", "SELF_MODEL.md");
const lessonsPath = path.join(repoRoot, "docs", "agi", "LESSONS.md");
const patternsPath = path.join(repoRoot, "docs", "agi", "PATTERNS.md");
const antiPatternsPath = path.join(repoRoot, "docs", "agi", "ANTI_PATTERNS.md");
const knowledgeMapPath = path.join(repoRoot, "docs", "agi", "KNOWLEDGE_MAP.md");
const sessionsDir = path.join(repoRoot, "docs", "sessions");
const workflowsDir = path.join(repoRoot, "docs", "workflows");
const workflowImprovementsDir = path.join(repoRoot, "docs", "agi", "workflow-improvements");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const readFileSafe = (targetPath) => {
    try {
        return {
            exists: true,
            content: fs.readFileSync(targetPath, "utf8"),
            updatedAt: fs.statSync(targetPath).mtime.toISOString()
        };
    } catch (err) {
        return { exists: false, error: err.message };
    }
};

const appendToFile = (targetPath, content) => {
    try {
        fs.appendFileSync(targetPath, content, "utf8");
        return { success: true, updatedAt: new Date().toISOString() };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const searchInSessions = (query, maxResults = 10) => {
    const results = [];
    const dirs = listSessionDirs();
    const lowerQuery = query.toLowerCase();
    
    for (const slug of dirs) {
        if (results.length >= maxResults) break;
        const sessionPath = path.join(sessionsDir, slug);
        const files = ["PLAN.md", "WORKING_NOTES.md", "SESSION_SUMMARY.md", "FOLLOW_UPS.md"];
        
        for (const fileName of files) {
            const filePath = path.join(sessionPath, fileName);
            if (!fs.existsSync(filePath)) continue;
            
            const content = fs.readFileSync(filePath, "utf8");
            if (content.toLowerCase().includes(lowerQuery)) {
                // Find matching lines for context
                const lines = content.split(/\r?\n/);
                const matchingLines = lines
                    .map((line, idx) => ({ line, lineNumber: idx + 1 }))
                    .filter(({ line }) => line.toLowerCase().includes(lowerQuery))
                    .slice(0, 3);
                
                results.push({
                    session: slug,
                    file: fileName,
                    matches: matchingLines
                });
                
                if (results.length >= maxResults) break;
            }
        }
    }
    return results;
};

const listSessionDirs = () => {
    if (!fs.existsSync(sessionsDir)) return [];
    return fs
        .readdirSync(sessionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => (a < b ? 1 : -1));
};

const resolveSession = (slug, maxSessions = 5) => {
    const dirs = listSessionDirs();
    const targetSlug = slug ?? dirs[0];
    if (!targetSlug) return null;
    const base = path.join(sessionsDir, targetSlug);
    if (!fs.existsSync(base)) return null;
    
    const sessionFiles = ["PLAN.md", "WORKING_NOTES.md", "SESSION_SUMMARY.md", "FOLLOW_UPS.md"];
    const payload = { slug: targetSlug, files: {} };
    for (const fileName of sessionFiles) {
        const filePath = path.join(base, fileName);
        if (fs.existsSync(filePath)) {
            payload.files[fileName] = readFileSafe(filePath);
        }
    }
    payload.available = dirs.slice(0, maxSessions);
    return payload;
};

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Helpers (AGI Singularity Enabled)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a workflow markdown file and extract structured metadata
 * Looks for YAML-like frontmatter, phases, prerequisites, checklists
 */
const parseWorkflowMetadata = (content, filePath) => {
    const lines = content.split(/\r?\n/);
    const metadata = {
        title: null,
        audience: null,
        prerequisites: [],
        phases: [],
        checklist: [],
        references: [],
        improvementHooks: []
    };
    
    // Extract title (first # heading)
    const titleMatch = content.match(/^# (.+)$/m);
    if (titleMatch) metadata.title = titleMatch[1].trim();
    
    // Extract audience (_Audience_: ...)
    const audienceMatch = content.match(/_Audience_:\s*(.+)/i);
    if (audienceMatch) metadata.audience = audienceMatch[1].trim();
    
    // Extract phases (## Phase N or ## heading patterns)
    const phaseRegex = /^## (?:Phase \d+[^\n]*|[^#\n]+)/gm;
    let phaseMatch;
    while ((phaseMatch = phaseRegex.exec(content)) !== null) {
        metadata.phases.push(phaseMatch[0].replace(/^## /, "").trim());
    }
    
    // Extract prerequisites (lines after "## Prerequisites" until next ##)
    const prereqSection = content.match(/## Prerequisites\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (prereqSection) {
        const prereqLines = prereqSection[1].split(/\r?\n/)
            .filter(line => line.trim().startsWith("-"))
            .map(line => line.replace(/^-\s*/, "").trim());
        metadata.prerequisites = prereqLines;
    }
    
    // Extract checklist items (- [ ] or - [x] patterns)
    const checklistRegex = /^- \[([ x])\] (.+)$/gm;
    let checkMatch;
    while ((checkMatch = checklistRegex.exec(content)) !== null) {
        metadata.checklist.push({
            done: checkMatch[1] === "x",
            item: checkMatch[2].trim()
        });
    }
    
    // Extract code block commands (potential automation points)
    const codeBlockRegex = /```(?:bash|sh|powershell)?\n([\s\S]*?)```/g;
    let codeMatch;
    const commands = [];
    while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
        const cmdLines = codeMatch[1].split(/\r?\n/)
            .filter(line => line.trim() && !line.trim().startsWith("#"));
        commands.push(...cmdLines);
    }
    metadata.commands = commands.slice(0, 10); // Cap for context efficiency
    
    // Identify improvement hooks (areas where agents could optimize)
    if (metadata.phases.length > 0) {
        metadata.improvementHooks.push("phase-ordering: Could phases be parallelized or reordered?");
    }
    if (commands.length > 3) {
        metadata.improvementHooks.push("command-batching: Multiple commands could be batched or scripted");
    }
    if (metadata.checklist.length > 5) {
        metadata.improvementHooks.push("checklist-automation: Some checklist items may be automatable");
    }
    
    return metadata;
};

/**
 * List all workflow files in docs/workflows
 */
const listWorkflowFiles = () => {
    if (!fs.existsSync(workflowsDir)) return [];
    
    const walkDir = (dir, prefix = "") => {
        const results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            
            if (entry.isDirectory()) {
                results.push(...walkDir(fullPath, relativePath));
            } else if (entry.name.endsWith(".md")) {
                const stat = fs.statSync(fullPath);
                results.push({
                    name: entry.name.replace(/\.md$/, ""),
                    path: relativePath,
                    fullPath,
                    updatedAt: stat.mtime.toISOString(),
                    size: stat.size
                });
            }
        }
        return results;
    };
    
    return walkDir(workflowsDir);
};

/**
 * Save a workflow improvement proposal
 */
const saveWorkflowImprovement = (workflowName, proposal) => {
    // Ensure directory exists
    if (!fs.existsSync(workflowImprovementsDir)) {
        fs.mkdirSync(workflowImprovementsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `${workflowName}-${timestamp}.md`;
    const filePath = path.join(workflowImprovementsDir, fileName);
    
    const content = `# Workflow Improvement Proposal

**Workflow**: ${workflowName}
**Proposed**: ${new Date().toISOString()}
**Status**: pending-review

## Summary
${proposal.summary}

## Current Issues
${proposal.issues.map(i => `- ${i}`).join("\n")}

## Proposed Changes
${proposal.changes.map(c => `- ${c}`).join("\n")}

## Expected Benefits
${proposal.benefits.map(b => `- ${b}`).join("\n")}

## Risk Assessment
${proposal.risks || "Low - incremental improvement"}

## Validation Criteria
${proposal.validation.map(v => `- [ ] ${v}`).join("\n")}

---
_Generated by AGI workflow improvement system_
`;
    
    fs.writeFileSync(filePath, content, "utf8");
    return { fileName, filePath: path.relative(repoRoot, filePath) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Session Continuity Helpers (for Careful Refactor Brain)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find sessions matching a topic, with status detection
 */
const findSessionsByTopic = (topic, maxResults = 5) => {
    const results = [];
    const dirs = listSessionDirs();
    const lowerTopic = topic.toLowerCase();
    
    for (const slug of dirs) {
        if (results.length >= maxResults) break;
        
        // Check if slug contains topic
        const slugMatch = slug.toLowerCase().includes(lowerTopic);
        
        // Check session files for topic
        const sessionPath = path.join(sessionsDir, slug);
        const planPath = path.join(sessionPath, "PLAN.md");
        const summaryPath = path.join(sessionPath, "SESSION_SUMMARY.md");
        
        let contentMatch = false;
        let status = "unknown";
        let taskProgress = null;
        
        if (fs.existsSync(planPath)) {
            const planContent = fs.readFileSync(planPath, "utf8");
            contentMatch = planContent.toLowerCase().includes(lowerTopic);
            
            // Parse task progress from PLAN.md
            const taskRegex = /- \[([ x])\] \*\*Task \d+[^*]*\*\*/g;
            const tasks = [...planContent.matchAll(taskRegex)];
            if (tasks.length > 0) {
                const completed = tasks.filter(t => t[1] === "x").length;
                taskProgress = { completed, total: tasks.length };
                status = completed === tasks.length ? "completed" : "in-progress";
            }
        }
        
        // Check if there's a summary (indicates completion)
        if (fs.existsSync(summaryPath)) {
            const summaryContent = fs.readFileSync(summaryPath, "utf8");
            if (summaryContent.length > 100) {
                status = "completed";
            }
        }
        
        if (slugMatch || contentMatch) {
            results.push({
                slug,
                status,
                taskProgress,
                slugMatch,
                contentMatch
            });
        }
    }
    
    return results;
};

/**
 * Parse task ledger from PLAN.md content
 */
const parseTaskLedger = (planContent) => {
    const tasks = [];
    const lines = planContent.split(/\r?\n/);
    let currentTask = null;
    
    for (const line of lines) {
        // Match main task: - [ ] **Task N: Name** (Status: ...)
        const taskMatch = line.match(/^- \[([ x])\] \*\*Task (\d+)[^*]*\*\*(?:\s*\(Status:\s*([^)]+)\))?/);
        if (taskMatch) {
            if (currentTask) tasks.push(currentTask);
            currentTask = {
                id: parseInt(taskMatch[2], 10),
                done: taskMatch[1] === "x",
                status: taskMatch[3]?.trim() || (taskMatch[1] === "x" ? "Completed" : "Not Started"),
                subtasks: []
            };
            continue;
        }
        
        // Match subtask: - [x] Subtask description
        const subtaskMatch = line.match(/^\s+- \[([ x])\] (.+)/);
        if (subtaskMatch && currentTask) {
            currentTask.subtasks.push({
                done: subtaskMatch[1] === "x",
                description: subtaskMatch[2].trim()
            });
        }
    }
    
    if (currentTask) tasks.push(currentTask);
    return tasks;
};

/**
 * Ensure a catalog file exists with proper structure
 */
const ensureCatalogFile = (filePath, title, description) => {
    if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const initialContent = `# ${title}

${description}

---

`;
        fs.writeFileSync(filePath, initialContent, "utf8");
    }
};

/**
 * Add an entry to a catalog file (patterns or anti-patterns)
 */
const addCatalogEntry = (filePath, title, catalogTitle, entry) => {
    ensureCatalogFile(filePath, catalogTitle, "AGI-accumulated knowledge catalog.");
    
    const content = fs.readFileSync(filePath, "utf8");
    const date = new Date().toISOString().split("T")[0];
    
    const newEntry = `
## ${entry.name}

**Added**: ${date}
**Context**: ${entry.context || "General"}

**When to use**: ${entry.whenToUse}

**Steps/Details**:
${entry.steps.map(s => `1. ${s}`).join("\n")}

${entry.example ? `**Example**: ${entry.example}` : ""}

---
`;
    
    const result = appendToFile(filePath, newEntry);
    return { ...result, entryName: entry.name };
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool Implementations
// ─────────────────────────────────────────────────────────────────────────────

const tools = {
    docs_memory_getSelfModel: {
        description: "Read the AGI SELF_MODEL.md document containing system identity and capabilities",
        inputSchema: {
            type: "object",
            properties: {},
            required: []
        },
        handler: () => {
            const data = readFileSafe(selfModelPath);
            if (!data.exists) {
                return { error: "SELF_MODEL.md not found", details: data.error };
            }
            return {
                type: "self-model",
                path: path.relative(repoRoot, selfModelPath),
                updatedAt: data.updatedAt,
                content: data.content
            };
        }
    },

    docs_memory_getLessons: {
        description: "Read excerpts from LESSONS.md containing accumulated agent learnings. RECOMMENDED WORKFLOW: (1) Call with onlyStats:true first to see size, (2) If totalLines > 100, use sinceDate to filter to recent lessons, (3) If still large, use maxLines to truncate. This prevents context overload.",
        inputSchema: {
            type: "object",
            properties: {
                maxLines: {
                    type: "number",
                    description: "Maximum lines to return (default 200)"
                },
                sinceDate: {
                    type: "string",
                    description: "Only return lessons from this date onwards (e.g., '2025-12-01'). Matches ## YYYY-MM-DD headers."
                },
                onlyStats: {
                    type: "boolean",
                    description: "If true, returns only statistics (totalLines, dateRange, sectionCount) without content. Use this first to decide filtering strategy."
                }
            },
            required: []
        },
        handler: (params) => {
            const data = readFileSafe(lessonsPath);
            if (!data.exists) {
                return { error: "LESSONS.md not found" };
            }
            
            const allLines = data.content.split(/\r?\n/);
            const dateHeaderRegex = /^## (\d{4}-\d{2}-\d{2})/;
            const dates = allLines
                .map(line => line.match(dateHeaderRegex))
                .filter(Boolean)
                .map(m => m[1]);
            
            const stats = {
                totalLines: allLines.length,
                sectionCount: dates.length,
                dateRange: dates.length > 0 ? { oldest: dates[dates.length - 1], newest: dates[0] } : null
            };
            
            // If only stats requested, return early (cheap call)
            if (params?.onlyStats) {
                return {
                    type: "lessons-stats",
                    path: path.relative(repoRoot, lessonsPath),
                    updatedAt: data.updatedAt,
                    stats,
                    hint: stats.totalLines > 100 
                        ? `Large file (${stats.totalLines} lines). Use sinceDate:'${stats.dateRange?.newest}' to get only recent lessons.`
                        : "File is small enough to fetch fully."
                };
            }
            
            const maxLines = params?.maxLines ?? 200;
            const sinceDate = params?.sinceDate;
            
            let lines = allLines;
            
            // If sinceDate provided, filter to sections >= that date
            if (sinceDate) {
                let inScope = false;
                const filteredLines = [];
                
                for (const line of lines) {
                    const match = line.match(dateHeaderRegex);
                    if (match) {
                        inScope = match[1] >= sinceDate;
                    }
                    if (inScope) {
                        filteredLines.push(line);
                    }
                }
                lines = filteredLines;
            }
            
            const excerpt = lines
                .filter((line) => line.trim().length > 0)
                .slice(0, maxLines)
                .join("\n");
            
            return {
                type: "lessons",
                path: path.relative(repoRoot, lessonsPath),
                updatedAt: data.updatedAt,
                stats,
                excerpt,
                filtered: sinceDate ? { sinceDate, lineCount: lines.length } : undefined
            };
        }
    },

    docs_memory_getSession: {
        description: "Read session files for a specific or latest session. RECOMMENDED: Start with files:['SESSION_SUMMARY.md'] for overview, then fetch PLAN.md or WORKING_NOTES.md if needed. Use maxLinesPerFile to prevent large files from overwhelming context.",
        inputSchema: {
            type: "object",
            properties: {
                slug: {
                    type: "string",
                    description: "Session slug (e.g., '2025-12-03-mcp-docs-memory'). If omitted, returns latest session."
                },
                files: {
                    type: "array",
                    items: { type: "string" },
                    description: "Which files to include (e.g., ['PLAN.md', 'SESSION_SUMMARY.md']). If omitted, returns all files. Options: PLAN.md, WORKING_NOTES.md, SESSION_SUMMARY.md, FOLLOW_UPS.md"
                },
                maxLinesPerFile: {
                    type: "number",
                    description: "Maximum lines to return per file (default: unlimited). Use to prevent large WORKING_NOTES from overwhelming context."
                }
            },
            required: []
        },
        handler: (params) => {
            const dirs = listSessionDirs();
            const targetSlug = params?.slug ?? dirs[0];
            if (!targetSlug) return { error: "No sessions found" };
            
            const base = path.join(sessionsDir, targetSlug);
            if (!fs.existsSync(base)) {
                return { error: `Session ${targetSlug} not found` };
            }
            
            const allFiles = ["PLAN.md", "WORKING_NOTES.md", "SESSION_SUMMARY.md", "FOLLOW_UPS.md"];
            const requestedFiles = params?.files ?? allFiles;
            const maxLines = params?.maxLinesPerFile;
            
            const payload = { slug: targetSlug, files: {}, fileSizes: {} };
            for (const fileName of allFiles) {
                const filePath = path.join(base, fileName);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, "utf8");
                    const lineCount = content.split(/\r?\n/).length;
                    payload.fileSizes[fileName] = lineCount;
                    
                    // Only include content if file was requested
                    if (requestedFiles.includes(fileName)) {
                        const data = readFileSafe(filePath);
                        if (data.exists && maxLines && lineCount > maxLines) {
                            const lines = data.content.split(/\r?\n/);
                            data.content = lines.slice(0, maxLines).join("\n");
                            data.content += `\n\n... (truncated, ${lineCount - maxLines} more lines)`;
                            data.truncated = true;
                            data.totalLines = lineCount;
                        }
                        payload.files[fileName] = data;
                    }
                }
            }
            payload.available = dirs.slice(0, 5);
            payload.hint = Object.entries(payload.fileSizes)
                .filter(([_, size]) => size > 100)
                .map(([name, size]) => `${name}: ${size} lines`)
                .join(", ") || "All files are small";
            return payload;
        }
    },

    docs_memory_listSessions: {
        description: "List available session directories",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Maximum sessions to return (default 10)"
                }
            },
            required: []
        },
        handler: (params) => {
            const limit = params?.limit ?? 10;
            const sessions = listSessionDirs().slice(0, limit);
            return { sessions, total: listSessionDirs().length };
        }
    },

    docs_memory_appendLessons: {
        description: "Append a new lesson or pattern to LESSONS.md. Use this to record learnings during a session.",
        inputSchema: {
            type: "object",
            properties: {
                lesson: {
                    type: "string",
                    description: "The lesson text to append (will be prefixed with '- ')"
                },
                category: {
                    type: "string",
                    description: "Optional category header (e.g., '## 2025-12-03'). If provided, adds under this heading."
                }
            },
            required: ["lesson"]
        },
        handler: (params) => {
            if (!params?.lesson) {
                return { error: "lesson parameter is required" };
            }
            const date = new Date().toISOString().split("T")[0];
            const header = params.category || `## ${date}`;
            const content = fs.existsSync(lessonsPath) ? fs.readFileSync(lessonsPath, "utf8") : "";
            
            // Check if header exists, if not add it
            let toAppend;
            if (content.includes(header)) {
                // Find the header and append after it
                toAppend = `- ${params.lesson}\n`;
            } else {
                // Add new section
                toAppend = `\n${header}\n- ${params.lesson}\n`;
            }
            
            const result = appendToFile(lessonsPath, toAppend);
            return { ...result, appended: params.lesson };
        }
    },

    docs_memory_searchSessions: {
        description: "Search across all session files for a keyword or phrase. Returns matching sessions and context.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search term to find in session files"
                },
                maxResults: {
                    type: "number",
                    description: "Maximum results to return (default 10)"
                }
            },
            required: ["query"]
        },
        handler: (params) => {
            if (!params?.query) {
                return { error: "query parameter is required" };
            }
            const results = searchInSessions(params.query, params.maxResults ?? 10);
            return {
                query: params.query,
                resultCount: results.length,
                results
            };
        }
    },

    docs_memory_appendToSession: {
        description: "Append content to a session file (WORKING_NOTES.md or FOLLOW_UPS.md). Use for logging progress.",
        inputSchema: {
            type: "object",
            properties: {
                slug: {
                    type: "string",
                    description: "Session slug. If omitted, uses latest session."
                },
                file: {
                    type: "string",
                    enum: ["WORKING_NOTES.md", "FOLLOW_UPS.md"],
                    description: "Which file to append to"
                },
                content: {
                    type: "string",
                    description: "Content to append"
                }
            },
            required: ["file", "content"]
        },
        handler: (params) => {
            if (!params?.file || !params?.content) {
                return { error: "file and content parameters are required" };
            }
            if (!["WORKING_NOTES.md", "FOLLOW_UPS.md"].includes(params.file)) {
                return { error: "file must be WORKING_NOTES.md or FOLLOW_UPS.md" };
            }
            
            const dirs = listSessionDirs();
            const slug = params.slug ?? dirs[0];
            if (!slug) {
                return { error: "No sessions found" };
            }
            
            const filePath = path.join(sessionsDir, slug, params.file);
            if (!fs.existsSync(filePath)) {
                return { error: `File not found: ${params.file} in session ${slug}` };
            }
            
            const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16);
            const toAppend = `\n- ${timestamp} — ${params.content}`;
            const result = appendToFile(filePath, toAppend);
            return { ...result, session: slug, file: params.file };
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Workflow Tools (AGI Singularity Enabled)
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_listWorkflows: {
        description: "List all available workflow definitions in docs/workflows. Returns metadata including update times and sizes. Use this to discover what workflows exist before reading specific ones.",
        inputSchema: {
            type: "object",
            properties: {
                includeMetadata: {
                    type: "boolean",
                    description: "If true, parses each workflow to extract phases/checklists (slower but more informative)"
                }
            },
            required: []
        },
        handler: (params) => {
            const workflows = listWorkflowFiles();
            
            if (params?.includeMetadata) {
                return {
                    type: "workflow-list",
                    count: workflows.length,
                    workflows: workflows.map(w => {
                        const content = fs.readFileSync(w.fullPath, "utf8");
                        const meta = parseWorkflowMetadata(content, w.fullPath);
                        return {
                            name: w.name,
                            path: w.path,
                            title: meta.title,
                            audience: meta.audience,
                            phaseCount: meta.phases.length,
                            checklistCount: meta.checklist.length,
                            updatedAt: w.updatedAt
                        };
                    }),
                    hint: "Use getWorkflow with a specific name to read the full workflow content and metadata."
                };
            }
            
            return {
                type: "workflow-list",
                count: workflows.length,
                workflows: workflows.map(w => ({
                    name: w.name,
                    path: w.path,
                    updatedAt: w.updatedAt,
                    sizeBytes: w.size
                })),
                hint: "Add includeMetadata:true for phase/checklist counts, or use getWorkflow for full content."
            };
        }
    },

    docs_memory_getWorkflow: {
        description: "Read a workflow definition with structured metadata extraction. Returns the workflow content plus parsed phases, prerequisites, checklists, commands, and AGI improvement hooks. RECOMMENDED: Use this when you need to follow or improve a specific workflow.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Workflow name (e.g., 'tier1_tooling_loop' or 'session_bootstrap_workflow'). Use listWorkflows to discover available names."
                },
                contentOnly: {
                    type: "boolean",
                    description: "If true, returns only the raw content without parsed metadata (faster, smaller response)"
                },
                maxLines: {
                    type: "number",
                    description: "Maximum lines of content to return (default: unlimited)"
                }
            },
            required: ["name"]
        },
        handler: (params) => {
            if (!params?.name) {
                return { error: "name parameter is required" };
            }
            
            const workflows = listWorkflowFiles();
            const workflow = workflows.find(w => 
                w.name === params.name || 
                w.name.toLowerCase() === params.name.toLowerCase() ||
                w.path === params.name ||
                w.path === `${params.name}.md`
            );
            
            if (!workflow) {
                return { 
                    error: `Workflow '${params.name}' not found`,
                    available: workflows.slice(0, 10).map(w => w.name),
                    hint: "Use listWorkflows to see all available workflows"
                };
            }
            
            const data = readFileSafe(workflow.fullPath);
            if (!data.exists) {
                return { error: `Failed to read workflow: ${data.error}` };
            }
            
            let content = data.content;
            const totalLines = content.split(/\r?\n/).length;
            
            if (params?.maxLines && totalLines > params.maxLines) {
                content = content.split(/\r?\n/).slice(0, params.maxLines).join("\n");
                content += `\n\n... (truncated, ${totalLines - params.maxLines} more lines)`;
            }
            
            if (params?.contentOnly) {
                return {
                    type: "workflow",
                    name: workflow.name,
                    path: workflow.path,
                    updatedAt: data.updatedAt,
                    totalLines,
                    content
                };
            }
            
            const metadata = parseWorkflowMetadata(data.content, workflow.fullPath);
            
            return {
                type: "workflow",
                name: workflow.name,
                path: workflow.path,
                updatedAt: data.updatedAt,
                totalLines,
                metadata: {
                    title: metadata.title,
                    audience: metadata.audience,
                    prerequisites: metadata.prerequisites,
                    phases: metadata.phases,
                    checklist: metadata.checklist,
                    commands: metadata.commands,
                    improvementHooks: metadata.improvementHooks
                },
                content,
                hint: metadata.improvementHooks.length > 0 
                    ? `AGI improvement opportunities detected: ${metadata.improvementHooks.length}. Use proposeWorkflowImprovement to suggest optimizations.`
                    : "Workflow appears optimized. Follow phases in order."
            };
        }
    },

    docs_memory_proposeWorkflowImprovement: {
        description: "Propose an improvement to an existing workflow. AGI SINGULARITY ENABLED: This tool allows agents to suggest workflow optimizations that will be reviewed and potentially applied. Use this when you identify inefficiencies, missing steps, or optimization opportunities in a workflow.",
        inputSchema: {
            type: "object",
            properties: {
                workflowName: {
                    type: "string",
                    description: "Name of the workflow to improve"
                },
                summary: {
                    type: "string",
                    description: "One-sentence summary of the proposed improvement"
                },
                issues: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of current issues or inefficiencies identified"
                },
                changes: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of specific changes proposed"
                },
                benefits: {
                    type: "array",
                    items: { type: "string" },
                    description: "Expected benefits of the changes"
                },
                risks: {
                    type: "string",
                    description: "Risk assessment (optional, defaults to 'Low - incremental improvement')"
                },
                validation: {
                    type: "array",
                    items: { type: "string" },
                    description: "Criteria to validate the improvement worked"
                }
            },
            required: ["workflowName", "summary", "issues", "changes", "benefits", "validation"]
        },
        handler: (params) => {
            const required = ["workflowName", "summary", "issues", "changes", "benefits", "validation"];
            for (const field of required) {
                if (!params?.[field]) {
                    return { error: `${field} parameter is required` };
                }
            }
            
            // Verify workflow exists
            const workflows = listWorkflowFiles();
            const workflow = workflows.find(w => 
                w.name === params.workflowName || 
                w.name.toLowerCase() === params.workflowName.toLowerCase()
            );
            
            if (!workflow) {
                return { 
                    error: `Workflow '${params.workflowName}' not found`,
                    available: workflows.slice(0, 10).map(w => w.name)
                };
            }
            
            // Save the improvement proposal
            const result = saveWorkflowImprovement(params.workflowName, {
                summary: params.summary,
                issues: params.issues,
                changes: params.changes,
                benefits: params.benefits,
                risks: params.risks,
                validation: params.validation
            });
            
            return {
                success: true,
                type: "workflow-improvement-proposal",
                workflowName: params.workflowName,
                savedTo: result.filePath,
                status: "pending-review",
                hint: "Improvement proposal saved. A human or senior agent should review and apply changes to the original workflow.",
                nextSteps: [
                    `Review proposal at ${result.filePath}`,
                    `If approved, update ${workflow.path} with the changes`,
                    `Record the improvement in LESSONS.md for future reference`
                ]
            };
        }
    },

    docs_memory_searchWorkflows: {
        description: "Search across all workflow files for a keyword or pattern. Use this to find workflows relevant to a specific task or concept.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search term to find in workflow content"
                },
                maxResults: {
                    type: "number",
                    description: "Maximum results to return (default 5)"
                }
            },
            required: ["query"]
        },
        handler: (params) => {
            if (!params?.query) {
                return { error: "query parameter is required" };
            }
            
            const workflows = listWorkflowFiles();
            const lowerQuery = params.query.toLowerCase();
            const maxResults = params?.maxResults ?? 5;
            const results = [];
            
            for (const workflow of workflows) {
                if (results.length >= maxResults) break;
                
                const content = fs.readFileSync(workflow.fullPath, "utf8");
                if (content.toLowerCase().includes(lowerQuery)) {
                    const lines = content.split(/\r?\n/);
                    const matchingLines = lines
                        .map((line, idx) => ({ line, lineNumber: idx + 1 }))
                        .filter(({ line }) => line.toLowerCase().includes(lowerQuery))
                        .slice(0, 3);
                    
                    const metadata = parseWorkflowMetadata(content, workflow.fullPath);
                    
                    results.push({
                        name: workflow.name,
                        path: workflow.path,
                        title: metadata.title,
                        phaseCount: metadata.phases.length,
                        matches: matchingLines
                    });
                }
            }
            
            return {
                query: params.query,
                resultCount: results.length,
                results,
                hint: results.length > 0 
                    ? "Use getWorkflow with a specific name to read the full workflow."
                    : "No matches. Try a different search term or use listWorkflows to browse."
            };
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Session Continuity Tools (for 🧠 Careful Refactor Brain 🧠)
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_findOrContinueSession: {
        description: "CRITICAL FOR SESSION CONTINUITY: Find existing sessions on a topic before creating new ones. Returns matching sessions with their status (in-progress, completed) and task progress. Use this FIRST when starting any refactoring work.",
        inputSchema: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "Topic to search for (e.g., 'crawler refactor', 'NewsCrawler', 'factory pattern')"
                },
                maxResults: {
                    type: "number",
                    description: "Maximum sessions to return (default 5)"
                }
            },
            required: ["topic"]
        },
        handler: (params) => {
            if (!params?.topic) {
                return { error: "topic parameter is required" };
            }
            
            const results = findSessionsByTopic(params.topic, params.maxResults ?? 5);
            
            // Categorize results
            const inProgress = results.filter(r => r.status === "in-progress");
            const completed = results.filter(r => r.status === "completed");
            const unknown = results.filter(r => r.status === "unknown");
            
            let recommendation = null;
            if (inProgress.length > 0) {
                recommendation = {
                    action: "continue",
                    session: inProgress[0].slug,
                    reason: `Active session found with ${inProgress[0].taskProgress?.completed}/${inProgress[0].taskProgress?.total} tasks completed`
                };
            } else if (completed.length > 0) {
                recommendation = {
                    action: "review-then-create",
                    session: completed[0].slug,
                    reason: "Completed session found. Review learnings before creating new session."
                };
            } else {
                recommendation = {
                    action: "create-new",
                    reason: "No existing sessions found on this topic"
                };
            }
            
            return {
                topic: params.topic,
                resultCount: results.length,
                inProgress,
                completed,
                unknown,
                recommendation,
                hint: recommendation.action === "continue" 
                    ? `Use getSession with slug:'${recommendation.session}' to load the active session.`
                    : recommendation.action === "review-then-create"
                    ? `Use getSession with slug:'${recommendation.session}' to review prior learnings.`
                    : "Create a new session with session-init.js tool."
            };
        }
    },

    docs_memory_getTaskProgress: {
        description: "Get detailed task progress from a session's PLAN.md. Returns task ledger with completion status, useful for knowing where to resume work.",
        inputSchema: {
            type: "object",
            properties: {
                slug: {
                    type: "string",
                    description: "Session slug. If omitted, uses latest session."
                }
            },
            required: []
        },
        handler: (params) => {
            const dirs = listSessionDirs();
            const slug = params?.slug ?? dirs[0];
            if (!slug) return { error: "No sessions found" };
            
            const planPath = path.join(sessionsDir, slug, "PLAN.md");
            if (!fs.existsSync(planPath)) {
                return { error: `PLAN.md not found in session ${slug}` };
            }
            
            const content = fs.readFileSync(planPath, "utf8");
            const tasks = parseTaskLedger(content);
            
            const completedTasks = tasks.filter(t => t.done).length;
            const inProgressTasks = tasks.filter(t => !t.done && t.subtasks.some(s => s.done)).length;
            const notStartedTasks = tasks.filter(t => !t.done && !t.subtasks.some(s => s.done)).length;
            
            // Find next action
            let nextAction = null;
            for (const task of tasks) {
                if (!task.done) {
                    const nextSubtask = task.subtasks.find(s => !s.done);
                    nextAction = {
                        taskId: task.id,
                        taskStatus: task.status,
                        nextSubtask: nextSubtask?.description || "Start task"
                    };
                    break;
                }
            }
            
            return {
                session: slug,
                summary: {
                    total: tasks.length,
                    completed: completedTasks,
                    inProgress: inProgressTasks,
                    notStarted: notStartedTasks,
                    percentComplete: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0
                },
                tasks,
                nextAction,
                hint: nextAction 
                    ? `Resume at Task ${nextAction.taskId}: ${nextAction.nextSubtask}`
                    : "All tasks completed! Update SESSION_SUMMARY.md."
            };
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Pattern Catalog Tools (for knowledge accumulation)
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_addPattern: {
        description: "Add a reusable refactoring pattern to the patterns catalog. Use this when you discover a pattern that would help future refactoring work.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Pattern name (e.g., 'Extract Service from God Class')"
                },
                whenToUse: {
                    type: "string",
                    description: "When this pattern applies (e.g., 'Class has >500 lines, multiple responsibilities')"
                },
                steps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Ordered steps to apply the pattern"
                },
                context: {
                    type: "string",
                    description: "Optional context (e.g., 'NewsCrawler refactoring')"
                },
                example: {
                    type: "string",
                    description: "Optional example reference"
                }
            },
            required: ["name", "whenToUse", "steps"]
        },
        handler: (params) => {
            const required = ["name", "whenToUse", "steps"];
            for (const field of required) {
                if (!params?.[field]) {
                    return { error: `${field} parameter is required` };
                }
            }
            
            const result = addCatalogEntry(
                patternsPath, 
                "Refactoring Patterns Catalog",
                "Refactoring Patterns Catalog",
                {
                    name: params.name,
                    whenToUse: params.whenToUse,
                    steps: params.steps,
                    context: params.context,
                    example: params.example
                }
            );
            
            return {
                success: true,
                type: "pattern-added",
                pattern: params.name,
                savedTo: path.relative(repoRoot, patternsPath),
                hint: "Pattern saved to catalog. Future agents can reference this pattern."
            };
        }
    },

    docs_memory_addAntiPattern: {
        description: "Add an anti-pattern to avoid to the anti-patterns catalog. Use this when you encounter a problematic pattern that future agents should avoid.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Anti-pattern name (e.g., 'Factory That Just Wraps Constructor')"
                },
                symptoms: {
                    type: "string",
                    description: "How to recognize this anti-pattern"
                },
                whyBad: {
                    type: "string",
                    description: "Why this pattern is problematic"
                },
                better: {
                    type: "string",
                    description: "What to do instead"
                },
                context: {
                    type: "string",
                    description: "Optional context (e.g., 'CrawlerFactory.js')"
                },
                example: {
                    type: "string",
                    description: "Optional example reference"
                }
            },
            required: ["name", "symptoms", "whyBad", "better"]
        },
        handler: (params) => {
            const required = ["name", "symptoms", "whyBad", "better"];
            for (const field of required) {
                if (!params?.[field]) {
                    return { error: `${field} parameter is required` };
                }
            }
            
            const result = addCatalogEntry(
                antiPatternsPath,
                "Anti-Patterns Catalog", 
                "Anti-Patterns Catalog",
                {
                    name: params.name,
                    whenToUse: `Symptoms: ${params.symptoms}`,
                    steps: [
                        `Why it's bad: ${params.whyBad}`,
                        `Better approach: ${params.better}`
                    ],
                    context: params.context,
                    example: params.example
                }
            );
            
            return {
                success: true,
                type: "anti-pattern-added",
                antiPattern: params.name,
                savedTo: path.relative(repoRoot, antiPatternsPath),
                hint: "Anti-pattern saved to catalog. Future agents will avoid this mistake."
            };
        }
    },

    docs_memory_getPatterns: {
        description: "Read the patterns catalog to see accumulated refactoring patterns.",
        inputSchema: {
            type: "object",
            properties: {
                maxLines: {
                    type: "number",
                    description: "Maximum lines to return (default 200)"
                }
            },
            required: []
        },
        handler: (params) => {
            const data = readFileSafe(patternsPath);
            if (!data.exists) {
                return { 
                    exists: false, 
                    hint: "No patterns catalog yet. Use addPattern to create one."
                };
            }
            
            const maxLines = params?.maxLines ?? 200;
            let content = data.content;
            const totalLines = content.split(/\r?\n/).length;
            
            if (totalLines > maxLines) {
                content = content.split(/\r?\n/).slice(0, maxLines).join("\n");
                content += `\n\n... (truncated, ${totalLines - maxLines} more lines)`;
            }
            
            // Count patterns (## headers after the title)
            const patternCount = (content.match(/^## /gm) || []).length;
            
            return {
                type: "patterns-catalog",
                path: path.relative(repoRoot, patternsPath),
                updatedAt: data.updatedAt,
                patternCount,
                content
            };
        }
    },

    docs_memory_getAntiPatterns: {
        description: "Read the anti-patterns catalog to see patterns to avoid.",
        inputSchema: {
            type: "object",
            properties: {
                maxLines: {
                    type: "number",
                    description: "Maximum lines to return (default 200)"
                }
            },
            required: []
        },
        handler: (params) => {
            const data = readFileSafe(antiPatternsPath);
            if (!data.exists) {
                return { 
                    exists: false, 
                    hint: "No anti-patterns catalog yet. Use addAntiPattern to create one."
                };
            }
            
            const maxLines = params?.maxLines ?? 200;
            let content = data.content;
            const totalLines = content.split(/\r?\n/).length;
            
            if (totalLines > maxLines) {
                content = content.split(/\r?\n/).slice(0, maxLines).join("\n");
                content += `\n\n... (truncated, ${totalLines - maxLines} more lines)`;
            }
            
            // Count anti-patterns
            const antiPatternCount = (content.match(/^## /gm) || []).length;
            
            return {
                type: "anti-patterns-catalog",
                path: path.relative(repoRoot, antiPatternsPath),
                updatedAt: data.updatedAt,
                antiPatternCount,
                content
            };
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Knowledge Map Tool (track refactoring coverage)
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_updateKnowledgeMap: {
        description: "Update the knowledge map to track refactoring coverage across the codebase. Use this to record what areas have been refactored and their status.",
        inputSchema: {
            type: "object",
            properties: {
                area: {
                    type: "string",
                    description: "Code area (e.g., 'src/crawler/NewsCrawler.js')"
                },
                status: {
                    type: "string",
                    enum: ["planned", "in-progress", "completed", "needs-review"],
                    description: "Current refactoring status"
                },
                session: {
                    type: "string",
                    description: "Related session slug"
                },
                notes: {
                    type: "string",
                    description: "Brief notes about the refactoring"
                }
            },
            required: ["area", "status"]
        },
        handler: (params) => {
            if (!params?.area || !params?.status) {
                return { error: "area and status parameters are required" };
            }
            
            ensureCatalogFile(
                knowledgeMapPath, 
                "Knowledge Map: Refactoring Coverage",
                "Tracks what areas of the codebase have been refactored and documented."
            );
            
            const content = fs.readFileSync(knowledgeMapPath, "utf8");
            const date = new Date().toISOString().split("T")[0];
            
            const statusEmoji = {
                "planned": "📋",
                "in-progress": "🔄",
                "completed": "✅",
                "needs-review": "⚠️"
            };
            
            // Check if area already exists
            if (content.includes(`| \`${params.area}\``)) {
                // Update existing entry (simple approach: append note)
                const updateNote = `\n\n**Update ${date}**: ${params.area} → ${params.status}${params.notes ? `: ${params.notes}` : ""}`;
                appendToFile(knowledgeMapPath, updateNote);
                return {
                    success: true,
                    type: "knowledge-map-updated",
                    area: params.area,
                    status: params.status,
                    action: "updated"
                };
            }
            
            // Add new entry
            const entry = `| \`${params.area}\` | ${statusEmoji[params.status]} ${params.status} | ${params.session || "—"} | ${params.notes || "—"} |\n`;
            
            // Check if table exists, if not create it
            if (!content.includes("| Area |")) {
                const tableHeader = `\n| Area | Status | Session | Notes |\n|------|--------|---------|-------|\n`;
                appendToFile(knowledgeMapPath, tableHeader + entry);
            } else {
                appendToFile(knowledgeMapPath, entry);
            }
            
            return {
                success: true,
                type: "knowledge-map-updated",
                area: params.area,
                status: params.status,
                action: "added",
                savedTo: path.relative(repoRoot, knowledgeMapPath)
            };
        }
    },

    docs_memory_getKnowledgeMap: {
        description: "Read the knowledge map showing refactoring coverage across the codebase.",
        inputSchema: {
            type: "object",
            properties: {},
            required: []
        },
        handler: () => {
            const data = readFileSafe(knowledgeMapPath);
            if (!data.exists) {
                return { 
                    exists: false, 
                    hint: "No knowledge map yet. Use updateKnowledgeMap to create one."
                };
            }
            
            // Parse the table to extract stats
            const lines = data.content.split(/\r?\n/);
            const tableLines = lines.filter(l => l.startsWith("|") && !l.includes("---"));
            
            const stats = {
                total: tableLines.length - 1, // Exclude header
                planned: 0,
                inProgress: 0,
                completed: 0,
                needsReview: 0
            };
            
            for (const line of tableLines) {
                if (line.includes("📋")) stats.planned++;
                if (line.includes("🔄")) stats.inProgress++;
                if (line.includes("✅")) stats.completed++;
                if (line.includes("⚠️")) stats.needsReview++;
            }
            
            return {
                type: "knowledge-map",
                path: path.relative(repoRoot, knowledgeMapPath),
                updatedAt: data.updatedAt,
                stats,
                content: data.content
            };
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol (stdio transport)
// ─────────────────────────────────────────────────────────────────────────────

const MCP_VERSION = "2025-11-25";

const createResponse = (id, result) => ({
    jsonrpc: "2.0",
    id,
    result
});

const createError = (id, code, message) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message }
});

const handleRequest = (request) => {
    const { id, method, params } = request;

    switch (method) {
        case "initialize":
            return createResponse(id, {
                protocolVersion: MCP_VERSION,
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: "docs-memory",
                    version: "1.0.0"
                }
            });

        case "notifications/initialized":
        case "notifications/cancelled":
            // No response needed for notifications
            return null;

        case "tools/list":
            return createResponse(id, {
                tools: Object.entries(tools).map(([name, tool]) => ({
                    name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            });

        case "tools/call": {
            const toolName = params?.name;
            const toolArgs = params?.arguments ?? {};
            const tool = tools[toolName];
            if (!tool) {
                return createError(id, -32602, `Unknown tool: ${toolName}`);
            }
            try {
                const result = tool.handler(toolArgs);
                return createResponse(id, {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                });
            } catch (err) {
                return createError(id, -32603, err.message);
            }
        }

        default:
            return createError(id, -32601, `Method not found: ${method}`);
    }
};

// Send JSON-RPC message with MCP stdio framing (Content-Length header)
const sendStdioMessage = (messageObj) => {
    const json = JSON.stringify(messageObj);
    // LSP-style framing: Content-Length and Content-Type headers followed by JSON body.
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${json}`;
    process.stdout.write(payload);
};

// Send either framed or headerless JSON. Default to framed; fall back to
// headerless only when the request arrived headerless (best-effort compatibility).
const sendMessage = (messageObj, { headerless = false } = {}) => {
    if (headerless) {
        process.stdout.write(`${JSON.stringify(messageObj)}\n`);
        return;
    }
    sendStdioMessage(messageObj);
};

// Debug log file for MCP troubleshooting
const debugLogPath = path.join(repoRoot, "tmp", "mcp-debug.log");
const debugLog = (msg) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${msg}\n`);
};

const runStdioServer = () => {
    debugLog("Server starting - stdio mode");
    let buffer = "";
    process.stdin.setEncoding("utf8");

    const processBuffer = () => {
        debugLog(`processBuffer called, buffer length: ${buffer.length}`);
        debugLog(`Buffer preview: ${JSON.stringify(buffer.slice(0, 100))}`);
        while (true) {
            // Accept both \r\n\r\n and \n\n as header terminators
            let headerEnd = buffer.indexOf("\r\n\r\n");
            let headerTermLen = 4;
            if (headerEnd === -1) {
                headerEnd = buffer.indexOf("\n\n");
                headerTermLen = 2;
            }

            // Fallback: some clients occasionally send raw JSON without headers.
            if (headerEnd === -1) {
                const trimmed = buffer.trimStart();
                if (trimmed.startsWith("{")) {
                    try {
                        const request = JSON.parse(trimmed);
                        buffer = "";
                        debugLog("Parsed headerless JSON message");
                        const response = handleRequest(request);
                        if (response) {
                            debugLog(`Sending headerless response for id: ${response.id}`);
                            sendMessage(response, { headerless: true });
                        }
                        continue;
                    } catch (e) {
                        debugLog(`Headerless parse pending: ${e.message}`);
                        return;
                    }
                }
                debugLog("No complete header yet");
                return;
            }

            const header = buffer.slice(0, headerEnd);
            debugLog(`Header: ${header}`);
            const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
            if (!contentLengthMatch) {
                debugLog("Missing Content-Length header!");
                sendStdioMessage(createError(null, -32700, "Missing Content-Length header"));
                buffer = buffer.slice(headerEnd + headerTermLen);
                continue;
            }

            const contentLength = Number(contentLengthMatch[1]);
            const messageEnd = headerEnd + headerTermLen + contentLength;
            if (buffer.length < messageEnd) {
                debugLog(`Waiting for more data: have ${buffer.length}, need ${messageEnd}`);
                return;
            }

            const message = buffer.slice(headerEnd + headerTermLen, messageEnd);
            buffer = buffer.slice(messageEnd);
            debugLog(`Message: ${message.slice(0, 200)}`);

            let request;
            try {
                request = JSON.parse(message);
            } catch (e) {
                debugLog(`Parse error: ${e.message}`);
                sendStdioMessage(createError(null, -32700, "Parse error"));
                continue;
            }

            debugLog(`Request method: ${request.method}, id: ${request.id}`);
            const response = handleRequest(request);
            if (response) {
                debugLog(`Sending framed response for id: ${response.id}`);
                sendMessage(response, { headerless: false });
            } else {
                debugLog("No response (notification)");
            }
        }
    };

    process.stdin.on("data", (chunk) => {
        debugLog(`stdin data: ${chunk.length} bytes`);
        buffer += chunk.toString();
        processBuffer();
    });

    process.stdin.on("end", () => {
        debugLog("stdin end - exiting");
        process.exit(0);
    });
    
    process.stdin.on("error", (err) => {
        debugLog(`stdin error: ${err.message}`);
    });
    
    debugLog("Server ready, waiting for input");
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server (optional CLI mode)
// ─────────────────────────────────────────────────────────────────────────────

const runHttpServer = (port = 4399) => {
    const http = require("http");

    const sendJson = (res, statusCode, body) => {
        const json = JSON.stringify(body, null, 2);
        res.writeHead(statusCode, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(json)
        });
        res.end(json);
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const segments = url.pathname.replace(/^\/+/u, "").split("/").filter(Boolean);

        if (req.method !== "GET") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
        }

        // Route: /
        if (segments.length === 0) {
            sendJson(res, 200, {
                service: "docs-memory-mcp",
                mode: "http",
                routes: [
                    "/health",
                    "/tools",
                    "/memory/self-model",
                    "/memory/lessons",
                    "/memory/sessions",
                    "/memory/sessions/latest",
                    "/memory/sessions/{slug}"
                ]
            });
            return;
        }

        // Route: /health
        if (segments[0] === "health") {
            const missing = [selfModelPath, lessonsPath].filter((p) => !fs.existsSync(p));
            sendJson(res, 200, { status: "ok", missingFiles: missing });
            return;
        }

        // Route: /tools
        if (segments[0] === "tools") {
            sendJson(res, 200, {
                tools: Object.entries(tools).map(([name, tool]) => ({
                    name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            });
            return;
        }

        // Routes: /memory/*
        if (segments[0] === "memory") {
            const resource = segments[1];

            if (resource === "self-model") {
                sendJson(res, 200, tools.docs_memory_getSelfModel.handler());
                return;
            }

            if (resource === "lessons") {
                const maxLines = parseInt(url.searchParams.get("maxLines") || "200", 10);
                sendJson(res, 200, tools.docs_memory_getLessons.handler({ maxLines }));
                return;
            }

            if (resource === "sessions") {
                const slug = segments[2];
                if (!slug || slug === "latest") {
                    sendJson(res, 200, tools.docs_memory_getSession.handler());
                } else if (slug === "list") {
                    const limit = parseInt(url.searchParams.get("limit") || "10", 10);
                    sendJson(res, 200, tools.docs_memory_listSessions.handler({ limit }));
                } else {
                    const result = tools.docs_memory_getSession.handler({ slug });
                    sendJson(res, result.error ? 404 : 200, result);
                }
                return;
            }
        }

        sendJson(res, 404, { error: "Not found" });
    });

    server.listen(port, () => {
        console.log(`Docs Memory MCP server (HTTP mode) listening on http://localhost:${port}`);
        console.log(`Self model path: ${selfModelPath}`);
    });

    return server;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI Entry Point
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes("--help") || args.includes("-h")) {
        console.log(`
docs-memory MCP Server (AGI Singularity Enabled)

Usage:
  node mcp-server.js              Run as MCP server (stdio transport)
  node mcp-server.js --http       Run as HTTP server (default port 4399)
  node mcp-server.js --http 3000  Run as HTTP server on port 3000

Options:
  --http [port]   Run in HTTP mode instead of stdio MCP
  --help, -h      Show this help

Tools exposed (READ - Memory):
  docs_memory_getSelfModel       Read SELF_MODEL.md
  docs_memory_getLessons         Read LESSONS.md excerpts
  docs_memory_getSession         Read session files
  docs_memory_listSessions       List available sessions
  docs_memory_searchSessions     Search across all sessions

Tools exposed (READ - Workflows):
  docs_memory_listWorkflows      List available workflows
  docs_memory_getWorkflow        Read workflow with structured metadata
  docs_memory_searchWorkflows    Search across workflow content

Tools exposed (READ - Session Continuity):
  docs_memory_findOrContinueSession   Find existing sessions on a topic (USE FIRST!)
  docs_memory_getTaskProgress         Get detailed task progress from PLAN.md

Tools exposed (READ - Pattern Catalogs):
  docs_memory_getPatterns        Read refactoring patterns catalog
  docs_memory_getAntiPatterns    Read anti-patterns catalog
  docs_memory_getKnowledgeMap    Read codebase refactoring coverage

Tools exposed (WRITE - Memory):
  docs_memory_appendLessons      Add new lesson to LESSONS.md
  docs_memory_appendToSession    Append to WORKING_NOTES or FOLLOW_UPS

Tools exposed (WRITE - Pattern Catalogs):
  docs_memory_addPattern         Add refactoring pattern to catalog
  docs_memory_addAntiPattern     Add anti-pattern to catalog
  docs_memory_updateKnowledgeMap Track refactoring coverage

Tools exposed (WRITE - AGI Self-Improvement):
  docs_memory_proposeWorkflowImprovement   Suggest workflow optimization
`);
        process.exit(0);
    }

    if (args.includes("--http")) {
        const portIdx = args.indexOf("--http");
        const port = parseInt(args[portIdx + 1], 10) || 4399;
        runHttpServer(port);
    } else {
        runStdioServer();
    }
}

module.exports = { tools, runHttpServer, runStdioServer };
