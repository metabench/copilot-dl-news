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
const skillsIndexPath = path.join(repoRoot, "docs", "agi", "SKILLS.md");
const skillsDir = path.join(repoRoot, "docs", "agi", "skills");
const sessionsDir = path.join(repoRoot, "docs", "sessions");
const workflowsDir = path.join(repoRoot, "docs", "workflows");
const workflowImprovementsDir = path.join(repoRoot, "docs", "agi", "workflow-improvements");
const logsDir = path.join(repoRoot, "docs", "agi", "logs");

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
// Skills Helpers (Claude Skills-inspired)
// ─────────────────────────────────────────────────────────────────────────────

const parseSkillsRegistry = () => {
    const data = readFileSafe(skillsIndexPath);
    if (!data.exists) {
        return { exists: false, error: data.error, skills: [] };
    }

    const lines = data.content.split(/\r?\n/);
    const skills = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|")) continue;
        if (trimmed.includes("| Skill |")) continue;
        if (trimmed.includes("| ---")) continue;

        // Expect: | skill-name | triggers | `docs/agi/skills/<name>/SKILL.md` |
        const cells = trimmed
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());

        if (cells.length < 3) continue;
        const name = cells[0];
        if (!name || name.toLowerCase() === "skill") continue;

        const triggers = cells[1];
        const locationRaw = cells[2];
        const location = locationRaw.replace(/^`|`$/g, "");

        skills.push({ name, triggers, location });
    }

    return {
        exists: true,
        path: path.relative(repoRoot, skillsIndexPath),
        updatedAt: data.updatedAt,
        skills
    };
};

const safeResolveRepoPath = (relativePath) => {
    const normalized = (relativePath || "").replace(/\\/g, "/");
    const resolved = path.resolve(repoRoot, normalized);
    const rel = path.relative(repoRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return null;
    }
    return resolved;
};

const resolveSkillFilePath = (skill) => {
    const registry = parseSkillsRegistry();
    if (!registry.exists) return null;
    const entry = registry.skills.find((s) => s.name === skill);
    const preferred = entry?.location;
    if (preferred) {
        return safeResolveRepoPath(preferred);
    }
    // Fallback: docs/agi/skills/<skill>/SKILL.md
    return path.join(skillsDir, skill, "SKILL.md");
};

const tokenize = (text) => {
    if (!text) return [];
    return String(text)
        .toLowerCase()
        .split(/[^a-z0-9\-]+/g)
        .map((t) => t.trim())
        .filter(Boolean);
};

const scoreSkillForTopic = ({ skill, topicTokens, sessionSlugs }) => {
    const nameTokens = tokenize(skill.name);
    const triggerTokens = tokenize(skill.triggers);

    let score = 0;
    const reasons = [];

    const nameHits = topicTokens.filter((t) => nameTokens.includes(t));
    if (nameHits.length) {
        score += nameHits.length * 6;
        reasons.push(`name matches: ${nameHits.join(", ")}`);
    }

    const triggerHits = topicTokens.filter((t) => triggerTokens.includes(t));
    if (triggerHits.length) {
        score += triggerHits.length * 3;
        reasons.push(`trigger matches: ${triggerHits.join(", ")}`);
    }

    // Session similarity boost (cheap heuristic): if the skill name appears in
    // topic-matching sessions, boost.
    if (Array.isArray(sessionSlugs) && sessionSlugs.length > 0) {
        let sessionBoost = 0;
        for (const slug of sessionSlugs) {
            const base = path.join(sessionsDir, slug);
            const files = ["PLAN.md", "SESSION_SUMMARY.md", "WORKING_NOTES.md"];
            for (const file of files) {
                const filePath = path.join(base, file);
                if (!fs.existsSync(filePath)) continue;
                const content = fs.readFileSync(filePath, "utf8").toLowerCase();
                if (content.includes(skill.name.toLowerCase())) {
                    sessionBoost += 4;
                } else {
                    // Small boost if any trigger token shows up.
                    const hit = triggerTokens.find((t) => t.length > 2 && content.includes(t));
                    if (hit) sessionBoost += 1;
                }
            }
        }

        if (sessionBoost > 0) {
            score += Math.min(sessionBoost, 12);
            reasons.push(`session similarity boost: +${Math.min(sessionBoost, 12)}`);
        }
    }

    return { score, reasons };
};

// ─────────────────────────────────────────────────────────────────────────────
// Objective State Helpers (resume parent objective)
// ─────────────────────────────────────────────────────────────────────────────

const resolveObjectiveStatePath = (slug) => {
    const dirs = listSessionDirs();
    const sessionSlug = slug ?? dirs[0];
    if (!sessionSlug) return { error: "No sessions found" };
    const base = path.join(sessionsDir, sessionSlug);
    if (!fs.existsSync(base)) return { error: `Session ${sessionSlug} not found` };
    return { slug: sessionSlug, filePath: path.join(base, "OBJECTIVE_STATE.json") };
};

const readJsonSafe = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            return { exists: false };
        }
        const raw = fs.readFileSync(filePath, "utf8");
        return {
            exists: true,
            value: JSON.parse(raw),
            updatedAt: fs.statSync(filePath).mtime.toISOString()
        };
    } catch (err) {
        return { exists: false, error: err.message };
    }
};

const writeJsonSafe = (filePath, value) => {
    try {
        fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        return { success: true, updatedAt: new Date().toISOString() };
    } catch (err) {
        return { success: false, error: err.message };
    }
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
    // Skills Tools (MCP-first Skills access)
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_listSkills: {
        description: "List Skills from docs/agi/SKILLS.md (Claude Skills-inspired). Use this first to discover available Skills.",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Maximum skills to return (default 50)"
                }
            },
            required: []
        },
        handler: (params) => {
            const registry = parseSkillsRegistry();
            if (!registry.exists) {
                return { exists: false, error: registry.error, hint: "SKILLS.md not found" };
            }
            const limit = params?.limit ?? 50;
            return {
                type: "skills-list",
                path: registry.path,
                updatedAt: registry.updatedAt,
                count: registry.skills.length,
                skills: registry.skills.slice(0, limit)
            };
        }
    },

    docs_memory_searchSkills: {
        description: "Search Skills registry and Skill docs for a query. Use this to find the right Skill SOP quickly.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search term (matches skill name, triggers, and SKILL.md contents)"
                },
                maxResults: {
                    type: "number",
                    description: "Maximum results to return (default 10)"
                }
            },
            required: ["query"]
        },
        handler: (params) => {
            if (!params?.query) return { error: "query parameter is required" };
            const registry = parseSkillsRegistry();
            if (!registry.exists) {
                return { exists: false, error: registry.error, hint: "SKILLS.md not found" };
            }

            const lower = params.query.toLowerCase();
            const maxResults = params?.maxResults ?? 10;
            const results = [];

            for (const skill of registry.skills) {
                if (results.length >= maxResults) break;

                const nameHit = skill.name.toLowerCase().includes(lower);
                const triggersHit = (skill.triggers || "").toLowerCase().includes(lower);
                let docHit = false;
                let docPreview = null;

                const skillPath = resolveSkillFilePath(skill.name);
                if (skillPath && fs.existsSync(skillPath)) {
                    const content = fs.readFileSync(skillPath, "utf8");
                    const idx = content.toLowerCase().indexOf(lower);
                    if (idx !== -1) {
                        docHit = true;
                        const start = Math.max(0, idx - 80);
                        const end = Math.min(content.length, idx + 200);
                        docPreview = content.slice(start, end).replace(/\r?\n/g, " ").trim();
                    }
                }

                if (nameHit || triggersHit || docHit) {
                    results.push({
                        name: skill.name,
                        triggers: skill.triggers,
                        location: skill.location,
                        matches: { name: nameHit, triggers: triggersHit, doc: docHit },
                        docPreview
                    });
                }
            }

            return {
                type: "skills-search",
                query: params.query,
                resultCount: results.length,
                results,
                hint: results.length ? "Use getSkill with a name to read the full SKILL.md." : "No matches. Try a broader query or listSkills." 
            };
        }
    },

    docs_memory_getSkill: {
        description: "Get a Skill SOP by name (reads docs/agi/skills/<skill>/SKILL.md).",
        inputSchema: {
            type: "object",
            properties: {
                skill: {
                    type: "string",
                    description: "Skill name (as listed in SKILLS.md)"
                }
            },
            required: ["skill"]
        },
        handler: (params) => {
            if (!params?.skill) return { error: "skill parameter is required" };

            const registry = parseSkillsRegistry();
            if (!registry.exists) {
                return { exists: false, error: registry.error, hint: "SKILLS.md not found" };
            }
            const entry = registry.skills.find((s) => s.name === params.skill);
            if (!entry) {
                return { error: `Unknown skill: ${params.skill}`, hint: "Use listSkills or searchSkills to discover available names." };
            }

            const skillPath = resolveSkillFilePath(params.skill);
            if (!skillPath) {
                return { error: "Skill path resolution failed" };
            }

            const data = readFileSafe(skillPath);
            if (!data.exists) {
                return { error: "SKILL.md not found", details: data.error, expected: path.relative(repoRoot, skillPath) };
            }

            return {
                type: "skill",
                skill: entry.name,
                triggers: entry.triggers,
                path: path.relative(repoRoot, skillPath),
                updatedAt: data.updatedAt,
                content: data.content
            };
        }
    },

    docs_memory_recommendSkills: {
        description: "Recommend Skills for a topic using the Skills registry plus session similarity. Returns ranked suggestions with reasons.",
        inputSchema: {
            type: "object",
            properties: {
                topic: {
                    type: "string",
                    description: "Topic / task description"
                },
                limit: {
                    type: "number",
                    description: "Maximum recommendations (default 5)"
                },
                sessionSample: {
                    type: "number",
                    description: "How many topic-matching sessions to consider for similarity (default 3)"
                }
            },
            required: ["topic"]
        },
        handler: (params) => {
            if (!params?.topic) return { error: "topic parameter is required" };
            const registry = parseSkillsRegistry();
            if (!registry.exists) {
                return { exists: false, error: registry.error, hint: "SKILLS.md not found" };
            }

            const topicTokens = tokenize(params.topic);
            const sessions = findSessionsByTopic(params.topic, params?.sessionSample ?? 3);
            const sessionSlugs = sessions.map((s) => s.slug);

            const scored = registry.skills
                .map((skill) => {
                    const { score, reasons } = scoreSkillForTopic({ skill, topicTokens, sessionSlugs });
                    return { skill: skill.name, triggers: skill.triggers, location: skill.location, score, reasons };
                })
                .filter((r) => r.score > 0)
                .sort((a, b) => b.score - a.score);

            const limit = params?.limit ?? 5;
            const top = scored.slice(0, limit);

            return {
                type: "skill-recommendations",
                topic: params.topic,
                consideredSessions: sessionSlugs,
                recommendations: top,
                hint: top.length ? `Use getSkill with skill:'${top[0].skill}' to load the SOP.` : "No strong matches. Use listSkills or searchSkills." 
            };
        }
    },

    docs_memory_listTopics: {
        description: "List topics derived from Skills (skill names + trigger keywords) for fast browsing.",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Maximum topics to return (default 200)"
                }
            },
            required: []
        },
        handler: (params) => {
            const registry = parseSkillsRegistry();
            if (!registry.exists) {
                return { exists: false, error: registry.error, hint: "SKILLS.md not found" };
            }

            const topics = new Set();
            for (const skill of registry.skills) {
                topics.add(skill.name);
                for (const token of tokenize(skill.triggers)) {
                    if (token.length < 3) continue;
                    topics.add(token);
                }
            }

            const list = Array.from(topics).sort((a, b) => a.localeCompare(b));
            const limit = params?.limit ?? 200;
            return {
                type: "topics",
                source: path.relative(repoRoot, skillsIndexPath),
                count: list.length,
                topics: list.slice(0, limit)
            };
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Objective Resume Tools (parent objective + detours + return step)
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_getObjectiveState: {
        description: "Get the current objective state for a session (parent objective, active detours, return step). Stored in docs/sessions/<slug>/OBJECTIVE_STATE.json.",
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
            const resolved = resolveObjectiveStatePath(params?.slug);
            if (resolved.error) return { error: resolved.error };
            const data = readJsonSafe(resolved.filePath);
            if (!data.exists) {
                return {
                    exists: false,
                    session: resolved.slug,
                    path: path.relative(repoRoot, resolved.filePath),
                    hint: "No objective state yet. Use updateObjectiveState to set parentObjective/returnStep and track detours."
                };
            }
            return {
                exists: true,
                type: "objective-state",
                session: resolved.slug,
                path: path.relative(repoRoot, resolved.filePath),
                updatedAt: data.updatedAt,
                state: data.value
            };
        }
    },

    docs_memory_updateObjectiveState: {
        description: "Update objective state for a session (set parent objective, add/complete detours, set return step). Writes OBJECTIVE_STATE.json in the session folder.",
        inputSchema: {
            type: "object",
            properties: {
                slug: {
                    type: "string",
                    description: "Session slug. If omitted, uses latest session."
                },
                parentObjective: {
                    type: "string",
                    description: "High-level objective to return to after detours"
                },
                returnStep: {
                    type: "string",
                    description: "Concrete next step to resume once detours are complete"
                },
                addDetour: {
                    type: "string",
                    description: "Add an active detour (short description)"
                },
                completeDetour: {
                    type: "string",
                    description: "Mark an active detour as completed (by exact title match)"
                },
                clearDetours: {
                    type: "boolean",
                    description: "If true, clears all detours"
                }
            },
            required: []
        },
        handler: (params) => {
            const resolved = resolveObjectiveStatePath(params?.slug);
            if (resolved.error) return { error: resolved.error };

            const current = readJsonSafe(resolved.filePath);
            const state = current.exists && current.value && typeof current.value === "object"
                ? current.value
                : { parentObjective: "", returnStep: "", detours: [] };

            if (typeof params?.parentObjective === "string") state.parentObjective = params.parentObjective;
            if (typeof params?.returnStep === "string") state.returnStep = params.returnStep;

            if (params?.clearDetours) state.detours = [];

            if (typeof params?.addDetour === "string" && params.addDetour.trim()) {
                const title = params.addDetour.trim();
                const existsActive = Array.isArray(state.detours) && state.detours.some((d) => d?.title === title && d?.status !== "completed");
                if (!existsActive) {
                    state.detours = Array.isArray(state.detours) ? state.detours : [];
                    state.detours.push({
                        title,
                        status: "active",
                        addedAt: new Date().toISOString()
                    });
                }
            }

            if (typeof params?.completeDetour === "string" && params.completeDetour.trim()) {
                const title = params.completeDetour.trim();
                if (Array.isArray(state.detours)) {
                    const detour = state.detours.find((d) => d?.title === title && d?.status !== "completed");
                    if (detour) {
                        detour.status = "completed";
                        detour.completedAt = new Date().toISOString();
                    }
                }
            }

            state.updatedAt = new Date().toISOString();
            const result = writeJsonSafe(resolved.filePath, state);
            if (!result.success) {
                return { error: "Failed to write objective state", details: result.error };
            }

            const activeDetours = Array.isArray(state.detours)
                ? state.detours.filter((d) => d?.status !== "completed")
                : [];

            return {
                success: true,
                type: "objective-state-updated",
                session: resolved.slug,
                path: path.relative(repoRoot, resolved.filePath),
                updatedAt: result.updatedAt,
                state,
                activeDetours,
                hint: activeDetours.length
                    ? `Detours active: ${activeDetours.length}. Complete them then resume: ${state.returnStep || "(set returnStep)"}`
                    : `No active detours. Resume: ${state.returnStep || "(set returnStep)"}`
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
                    description: "Code area (e.g., 'src/core/crawler/NewsCrawler.js')"
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
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Logging Tools - For apps to write logs that AI agents can read
    // ─────────────────────────────────────────────────────────────────────────

    docs_memory_appendLog: {
        description: "Append a log entry to a session log. Use this to record events from apps (crawlers, servers, etc.) so AI agents can analyze behavior. Logs are stored as NDJSON files for efficient streaming.",
        inputSchema: {
            type: "object",
            properties: {
                app: {
                    type: "string",
                    description: "App abbreviation (e.g., 'CRWL', 'ELEC', 'API', 'SRV')"
                },
                session: {
                    type: "string",
                    description: "Session ID for grouping logs (e.g., 'crawl-2025-01-14'). Defaults to 'default'."
                },
                level: {
                    type: "string",
                    enum: ["debug", "info", "warn", "error"],
                    description: "Log level (default: 'info')"
                },
                msg: {
                    type: "string",
                    description: "Log message"
                },
                data: {
                    type: "object",
                    description: "Optional structured data (JSON object)"
                }
            },
            required: ["msg"]
        },
        handler: (params) => {
            // Ensure logs directory exists
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            const entry = {
                ts: new Date().toISOString(),
                level: params.level || "info",
                app: params.app || "APP",
                session: params.session || "default",
                msg: params.msg,
                data: params.data || undefined
            };
            
            const fileName = `${entry.session}.ndjson`;
            const filePath = path.join(logsDir, fileName);
            
            try {
                fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
                return {
                    success: true,
                    type: "log-appended",
                    session: entry.session,
                    level: entry.level,
                    savedTo: path.relative(repoRoot, filePath)
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }
    },

    docs_memory_getLogs: {
        description: "Read logs from a session. Returns an array of log entries. Use limit and level to filter results. Perfect for AI agents to analyze app behavior.",
        inputSchema: {
            type: "object",
            properties: {
                session: {
                    type: "string",
                    description: "Session ID (e.g., 'crawl-2025-01-14'). Defaults to 'default'."
                },
                limit: {
                    type: "number",
                    description: "Maximum entries to return from the end (most recent first). Default: 50."
                },
                level: {
                    type: "string",
                    enum: ["debug", "info", "warn", "error"],
                    description: "Minimum log level to include (e.g., 'warn' returns warn+error)"
                },
                since: {
                    type: "string",
                    description: "ISO timestamp - only return logs after this time"
                },
                app: {
                    type: "string",
                    description: "Filter by app abbreviation"
                }
            },
            required: []
        },
        handler: (params) => {
            const session = params?.session || "default";
            const fileName = `${session}.ndjson`;
            const filePath = path.join(logsDir, fileName);
            
            if (!fs.existsSync(filePath)) {
                return { 
                    type: "logs",
                    session,
                    entries: [],
                    count: 0,
                    hint: "No logs found for this session"
                };
            }
            
            try {
                const content = fs.readFileSync(filePath, "utf8");
                let entries = content
                    .split("\n")
                    .filter(line => line.trim())
                    .map(line => {
                        try { return JSON.parse(line); } 
                        catch { return null; }
                    })
                    .filter(Boolean);
                
                // Filter by level
                if (params?.level) {
                    const levels = ["debug", "info", "warn", "error"];
                    const minLevel = levels.indexOf(params.level);
                    entries = entries.filter(e => levels.indexOf(e.level) >= minLevel);
                }
                
                // Filter by time
                if (params?.since) {
                    entries = entries.filter(e => e.ts >= params.since);
                }
                
                // Filter by app
                if (params?.app) {
                    entries = entries.filter(e => e.app === params.app);
                }
                
                // Limit (from end - most recent)
                const limit = params?.limit ?? 50;
                if (entries.length > limit) {
                    entries = entries.slice(-limit);
                }
                
                return {
                    type: "logs",
                    session,
                    entries,
                    count: entries.length,
                    path: path.relative(repoRoot, filePath)
                };
            } catch (err) {
                return { error: err.message };
            }
        }
    },

    docs_memory_listLogSessions: {
        description: "List all available log sessions with stats (size, entry count, last update).",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Maximum sessions to return (default: 20)"
                }
            },
            required: []
        },
        handler: (params) => {
            if (!fs.existsSync(logsDir)) {
                return {
                    type: "log-sessions",
                    sessions: [],
                    count: 0,
                    hint: "No logs directory yet. Use appendLog to create logs."
                };
            }
            
            try {
                const files = fs.readdirSync(logsDir)
                    .filter(f => f.endsWith(".ndjson"));
                
                let sessions = files.map(fileName => {
                    const filePath = path.join(logsDir, fileName);
                    const stat = fs.statSync(filePath);
                    const content = fs.readFileSync(filePath, "utf8");
                    const entryCount = content.split("\n").filter(l => l.trim()).length;
                    
                    // Get first and last timestamp
                    const lines = content.split("\n").filter(l => l.trim());
                    let firstTs = null, lastTs = null;
                    try {
                        if (lines.length > 0) firstTs = JSON.parse(lines[0]).ts;
                        if (lines.length > 0) lastTs = JSON.parse(lines[lines.length - 1]).ts;
                    } catch {}
                    
                    return {
                        session: fileName.replace(".ndjson", ""),
                        size: stat.size,
                        entryCount,
                        firstEntry: firstTs,
                        lastEntry: lastTs,
                        updatedAt: stat.mtime.toISOString()
                    };
                }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
                
                const limit = params?.limit ?? 20;
                if (sessions.length > limit) {
                    sessions = sessions.slice(0, limit);
                }
                
                return {
                    type: "log-sessions",
                    sessions,
                    count: sessions.length,
                    logsDir: path.relative(repoRoot, logsDir)
                };
            } catch (err) {
                return { error: err.message };
            }
        }
    },

    docs_memory_clearLogs: {
        description: "Clear logs for a session or all sessions. Use with caution.",
        inputSchema: {
            type: "object",
            properties: {
                session: {
                    type: "string",
                    description: "Session ID to clear, or 'all' to clear all logs"
                },
                olderThan: {
                    type: "string",
                    description: "ISO timestamp - only clear logs older than this (for selective pruning)"
                }
            },
            required: ["session"]
        },
        handler: (params) => {
            if (!fs.existsSync(logsDir)) {
                return { success: true, cleared: 0, hint: "No logs directory exists" };
            }
            
            try {
                if (params.session === "all") {
                    const files = fs.readdirSync(logsDir).filter(f => f.endsWith(".ndjson"));
                    files.forEach(f => fs.unlinkSync(path.join(logsDir, f)));
                    return { success: true, cleared: files.length, type: "logs-cleared" };
                } else {
                    const fileName = `${params.session}.ndjson`;
                    const filePath = path.join(logsDir, fileName);
                    
                    if (!fs.existsSync(filePath)) {
                        return { success: true, cleared: 0, hint: "Session not found" };
                    }
                    
                    // If olderThan is specified, filter instead of delete
                    if (params.olderThan) {
                        const content = fs.readFileSync(filePath, "utf8");
                        const lines = content.split("\n").filter(l => l.trim());
                        const kept = lines.filter(line => {
                            try {
                                const entry = JSON.parse(line);
                                return entry.ts >= params.olderThan;
                            } catch { return true; }
                        });
                        fs.writeFileSync(filePath, kept.join("\n") + (kept.length > 0 ? "\n" : ""), "utf8");
                        return {
                            success: true,
                            cleared: lines.length - kept.length,
                            kept: kept.length,
                            type: "logs-pruned"
                        };
                    }
                    
                    fs.unlinkSync(filePath);
                    return { success: true, cleared: 1, type: "logs-cleared" };
                }
            } catch (err) {
                return { success: false, error: err.message };
            }
        }
    },

    docs_memory_searchLogs: {
        description: "Search across log sessions for a message pattern. Returns matching entries with context.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Text to search for in log messages"
                },
                level: {
                    type: "string",
                    enum: ["debug", "info", "warn", "error"],
                    description: "Minimum log level to search"
                },
                app: {
                    type: "string",
                    description: "Filter by app abbreviation"
                },
                limit: {
                    type: "number",
                    description: "Maximum matches to return (default: 20)"
                }
            },
            required: ["query"]
        },
        handler: (params) => {
            if (!fs.existsSync(logsDir)) {
                return { type: "log-search", query: params.query, matches: [], count: 0 };
            }
            
            try {
                const files = fs.readdirSync(logsDir).filter(f => f.endsWith(".ndjson"));
                const limit = params?.limit ?? 20;
                const levels = ["debug", "info", "warn", "error"];
                const minLevel = params?.level ? levels.indexOf(params.level) : 0;
                const query = params.query.toLowerCase();
                
                const matches = [];
                
                for (const fileName of files) {
                    if (matches.length >= limit) break;
                    
                    const filePath = path.join(logsDir, fileName);
                    const content = fs.readFileSync(filePath, "utf8");
                    const session = fileName.replace(".ndjson", "");
                    
                    for (const line of content.split("\n").filter(l => l.trim())) {
                        if (matches.length >= limit) break;
                        
                        try {
                            const entry = JSON.parse(line);
                            
                            // Apply filters
                            if (levels.indexOf(entry.level) < minLevel) continue;
                            if (params?.app && entry.app !== params.app) continue;
                            
                            // Search in message and data
                            const msgMatch = entry.msg?.toLowerCase().includes(query);
                            const dataMatch = entry.data && JSON.stringify(entry.data).toLowerCase().includes(query);
                            
                            if (msgMatch || dataMatch) {
                                matches.push({ session, ...entry });
                            }
                        } catch {}
                    }
                }
                
                return {
                    type: "log-search",
                    query: params.query,
                    matches,
                    count: matches.length
                };
            } catch (err) {
                return { error: err.message };
            }
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

// Extract the first complete JSON object from a headerless buffer so the
// stdio server can process concatenated MCP messages without blocking.
// Returns an object describing the state of the buffer so the caller can
// decide whether to keep waiting, skip junk, or handle the parsed payload.
const extractFirstJsonMessage = (buffer) => {
    const startIdx = buffer.search(/\S/);
    if (startIdx === -1) return { type: "empty" };
    if (buffer[startIdx] !== "{") {
        return { type: "skip", remove: startIdx + 1 };
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < buffer.length; i++) {
        const ch = buffer[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === "\\") {
            escaped = true;
            continue;
        }

        if (ch === "\"") {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;

        if (depth === 0) {
            return {
                type: "message",
                jsonText: buffer.slice(startIdx, i + 1),
                rest: buffer.slice(i + 1)
            };
        }
    }

    return { type: "partial" };
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
                const headerlessResult = extractFirstJsonMessage(buffer);

                if (headerlessResult.type === "empty") {
                    buffer = "";
                    debugLog("Headerless buffer empty after trimming");
                    return;
                }

                if (headerlessResult.type === "skip") {
                    debugLog("Discarding leading non-JSON data in headerless buffer");
                    buffer = buffer.slice(headerlessResult.remove);
                    continue;
                }

                if (headerlessResult.type === "partial") {
                    debugLog("Headerless parse pending: incomplete JSON message");
                    return;
                }

                try {
                    const request = JSON.parse(headerlessResult.jsonText);
                    buffer = headerlessResult.rest;
                    debugLog("Parsed headerless JSON message");
                    const response = handleRequest(request);
                    if (response) {
                        debugLog(`Sending headerless response for id: ${response.id}`);
                        sendMessage(response, { headerless: true });
                    } else {
                        debugLog("No response (notification)");
                    }
                    continue;
                } catch (e) {
                    debugLog(`Headerless parse error: ${e.message}`);
                    buffer = headerlessResult.rest;
                    sendMessage(createError(null, -32700, "Parse error"), { headerless: true });
                    continue;
                }
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
                    "/memory/sessions/{slug}",
                    "/memory/logs",
                    "/memory/logs/list",
                    "/memory/logs/{session}",
                    "/memory/logs/search?q={query}"
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

            if (resource === "logs") {
                const session = segments[2];
                if (!session || session === "list") {
                    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
                    sendJson(res, 200, tools.docs_memory_listLogSessions.handler({ limit }));
                } else if (session === "search") {
                    const query = url.searchParams.get("q") || url.searchParams.get("query");
                    if (!query) {
                        sendJson(res, 400, { error: "Missing query parameter (q or query)" });
                        return;
                    }
                    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
                    const level = url.searchParams.get("level");
                    const app = url.searchParams.get("app");
                    sendJson(res, 200, tools.docs_memory_searchLogs.handler({ query, limit, level, app }));
                } else {
                    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
                    const level = url.searchParams.get("level");
                    const since = url.searchParams.get("since");
                    const app = url.searchParams.get("app");
                    sendJson(res, 200, tools.docs_memory_getLogs.handler({ session, limit, level, since, app }));
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

Tools exposed (READ - Skills):
    docs_memory_listSkills         List Skills from SKILLS.md
    docs_memory_searchSkills       Search Skills + SKILL.md docs
    docs_memory_getSkill           Read a specific Skill SOP
    docs_memory_recommendSkills    Recommend Skills for a topic
    docs_memory_listTopics         List topics derived from skills/triggers

Tools exposed (READ - Workflows):
  docs_memory_listWorkflows      List available workflows
  docs_memory_getWorkflow        Read workflow with structured metadata
  docs_memory_searchWorkflows    Search across workflow content

Tools exposed (READ - Session Continuity):
  docs_memory_findOrContinueSession   Find existing sessions on a topic (USE FIRST!)
  docs_memory_getTaskProgress         Get detailed task progress from PLAN.md

Tools exposed (READ - Objective Resume):
    docs_memory_getObjectiveState       Read objective state for a session

Tools exposed (READ - Pattern Catalogs):
  docs_memory_getPatterns        Read refactoring patterns catalog
  docs_memory_getAntiPatterns    Read anti-patterns catalog
  docs_memory_getKnowledgeMap    Read codebase refactoring coverage

Tools exposed (WRITE - Memory):
  docs_memory_appendLessons      Add new lesson to LESSONS.md
  docs_memory_appendToSession    Append to WORKING_NOTES or FOLLOW_UPS

Tools exposed (WRITE - Objective Resume):
    docs_memory_updateObjectiveState     Update objective state for a session

Tools exposed (WRITE - Pattern Catalogs):
  docs_memory_addPattern         Add refactoring pattern to catalog
  docs_memory_addAntiPattern     Add anti-pattern to catalog
  docs_memory_updateKnowledgeMap Track refactoring coverage

Tools exposed (WRITE - AGI Self-Improvement):
  docs_memory_proposeWorkflowImprovement   Suggest workflow optimization

Tools exposed (Logging - For App Telemetry):
  docs_memory_appendLog          Append log entry (auto-timestamped)
  docs_memory_getLogs            Read logs from a session
  docs_memory_listLogSessions    List all log sessions
  docs_memory_clearLogs          Clear logs (by session or all)
  docs_memory_searchLogs         Search across log sessions
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

