#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

function readText(filePath) {
	return fs.readFileSync(filePath, 'utf8');
}

function listAgentFiles(dirPath) {
	if (!fs.existsSync(dirPath)) {
		return [];
	}

	return fs
		.readdirSync(dirPath)
		.filter((name) => name.toLowerCase().endsWith('.agent.md'))
		.map((name) => path.join(dirPath, name));
}

function getAgentNameFromFile(filePath) {
	return path.basename(filePath).replace(/\.agent\.md$/i, '');
}

function findFrontmatter(source) {
	const lines = String(source || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/);

	const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
	if (firstNonEmptyIndex === -1) return null;
	if (lines[firstNonEmptyIndex].trim() !== '---') return null;

	const endIndexRelative = lines
		.slice(firstNonEmptyIndex + 1)
		.findIndex((line) => line.trim() === '---');

	if (endIndexRelative === -1) return null;

	const endIndex = firstNonEmptyIndex + 1 + endIndexRelative;

	return {
		frontmatter: lines.slice(firstNonEmptyIndex + 1, endIndex).join('\n'),
		startLine: firstNonEmptyIndex + 1,
		endLine: endIndex + 1
	};
}

function validateAgentFrontmatter({ agentName, frontmatter, allAgentNames, options }) {
	const issues = [];
	const warnings = [];

	if (!frontmatter) {
		warnings.push({
			level: 'warning',
			code: 'missing_frontmatter',
			message: 'No YAML frontmatter found (--- ... ---).'
		});
		return { issues, warnings, parsed: null };
	}

	let parsed = null;
	try {
		parsed = yaml.load(frontmatter.frontmatter) || {};
	} catch (error) {
		issues.push({
			level: 'error',
			code: 'yaml_parse_error',
			message: `YAML parse error: ${error.message}`,
			location: { startLine: frontmatter.startLine, endLine: frontmatter.endLine }
		});
		return { issues, warnings, parsed: null };
	}

	if (typeof parsed.description !== 'string' || parsed.description.trim().length === 0) {
		warnings.push({
			level: 'warning',
			code: 'missing_description',
			message: 'Frontmatter is missing a non-empty description.'
		});
	}

	if (parsed.tools !== undefined) {
		if (!Array.isArray(parsed.tools)) {
			issues.push({
				level: 'error',
				code: 'invalid_tools',
				message: 'Frontmatter "tools" must be an array of strings.'
			});
		} else {
			const nonStrings = parsed.tools.filter((t) => typeof t !== 'string');
			if (nonStrings.length > 0) {
				issues.push({
					level: 'error',
					code: 'invalid_tools',
					message: 'Frontmatter "tools" must contain only strings.'
				});
			}
		}
	} else {
		warnings.push({
			level: 'warning',
			code: 'missing_tools',
			message: 'Frontmatter is missing "tools" (capabilities may be limited in the host UI).'
		});
	}

	if (parsed.handoffs !== undefined) {
		if (!Array.isArray(parsed.handoffs)) {
			issues.push({
				level: 'error',
				code: 'invalid_handoffs',
				message: 'Frontmatter "handoffs" must be an array.'
			});
		} else {
			for (let i = 0; i < parsed.handoffs.length; i++) {
				const item = parsed.handoffs[i];
				if (!item || typeof item !== 'object') {
					issues.push({
						level: 'error',
						code: 'invalid_handoffs',
						message: `handoffs[${i}] must be an object.`
					});
					continue;
				}

				if (typeof item.label !== 'string' || item.label.trim().length === 0) {
					issues.push({
						level: 'error',
						code: 'invalid_handoffs',
						message: `handoffs[${i}].label must be a non-empty string.`
					});
				}

				if (typeof item.agent !== 'string' || item.agent.trim().length === 0) {
					issues.push({
						level: 'error',
						code: 'invalid_handoffs',
						message: `handoffs[${i}].agent must be a non-empty string.`
					});
				} else if (options.checkHandoffAgents) {
					const normalized = item.agent.trim();
					if (!allAgentNames.has(normalized)) {
						issues.push({
							level: 'error',
							code: 'handoff_agent_missing',
							message: `handoffs[${i}].agent refers to missing agent: "${normalized}".`
						});
					}
				}

				if (typeof item.prompt !== 'string' || item.prompt.trim().length === 0) {
					issues.push({
						level: 'error',
						code: 'invalid_handoffs',
						message: `handoffs[${i}].prompt must be a non-empty string.`
					});
				}
			}
		}
	}

	if (parsed.name && typeof parsed.name === 'string') {
		const fmName = parsed.name.trim();
		if (fmName && fmName !== agentName) {
			warnings.push({
				level: 'warning',
				code: 'frontmatter_name_mismatch',
				message: `Frontmatter name "${fmName}" does not match file name "${agentName}".`
			});
		}
	}

	return { issues, warnings, parsed };
}

function validateAgents({ agentDir, options }) {
	const files = listAgentFiles(agentDir);
	const allAgentNames = new Set(files.map(getAgentNameFromFile));

	const results = {
		agentDir,
		filesScanned: files.length,
		files: [],
		errorCount: 0,
		warningCount: 0
	};

	for (const filePath of files) {
		const agentName = getAgentNameFromFile(filePath);
		const source = readText(filePath);
		const frontmatter = findFrontmatter(source);

		const { issues, warnings } = validateAgentFrontmatter({
			agentName,
			frontmatter,
			allAgentNames,
			options
		});

		results.files.push({
			agentName,
			relativePath: path.relative(process.cwd(), filePath),
			hasFrontmatter: Boolean(frontmatter),
			issues,
			warnings
		});

		results.errorCount += issues.length;
		results.warningCount += warnings.length;
	}

	return results;
}

async function runCli() {
	const parser = new CliArgumentParser(
		'agent-validate',
		'Validate .github/agents/*.agent.md YAML frontmatter (tools/handoffs) for basic structural integrity',
		'1.0.0'
	);

	parser
		.add('--dir <path>', 'Agents directory to validate', path.join(process.cwd(), '.github', 'agents'))
		.add('--json', 'Emit JSON output', false, 'boolean')
		.add('--quiet', 'Suppress formatted output', false, 'boolean')
		.add('--strict', 'Treat warnings as errors (exit 1)', false, 'boolean')
		.add('--no-check-handoff-agents', 'Skip validation that handoff targets exist', true, 'boolean')
		.add('--lang <code>', 'Output language (en|zh|bilingual)', 'en');

	const args = parser.parse(process.argv);
	const formatter = new CliFormatter({ languageMode: args.lang });

	const results = validateAgents({
		agentDir: path.resolve(args.dir),
		options: {
			checkHandoffAgents: args.checkHandoffAgents !== false
		}
	});

	const strict = args.strict === true;
	const exitWithFailure = results.errorCount > 0 || (strict && results.warningCount > 0);

	if (args.json) {
		console.log(
			JSON.stringify(
				{
					...results,
					strict,
					ok: !exitWithFailure
				},
				null,
				2
			)
		);

		if (exitWithFailure) {
			process.exitCode = 1;
		}

		return;
	}

	if (args.quiet !== true) {
		formatter.header('agent frontmatter validation');
		formatter.stat('Agent directory', results.agentDir);
		formatter.stat('Files scanned', results.filesScanned, 'number');
		formatter.stat('Errors', results.errorCount, 'number');
		formatter.stat('Warnings', results.warningCount, 'number');
		formatter.stat('Mode', strict ? 'strict (warnings fail)' : 'default');

		const filesWithErrors = results.files.filter((f) => f.issues.length > 0);
		const filesWithWarnings = results.files.filter((f) => f.warnings.length > 0);

		if (filesWithErrors.length > 0) {
			formatter.section('Errors');
			for (const file of filesWithErrors) {
				formatter.error(`${file.relativePath}`);
				for (const issue of file.issues) {
					formatter.error(`- ${issue.code}: ${issue.message}`);
				}
			}
		}

		if (filesWithWarnings.length > 0) {
			formatter.section('Warnings');
			for (const file of filesWithWarnings) {
				formatter.warn(`${file.relativePath}`);
				for (const warning of file.warnings) {
					formatter.warn(`- ${warning.code}: ${warning.message}`);
				}
			}
		}

		if (!exitWithFailure) {
			formatter.success('Agent frontmatter validated without blocking issues.');
		} else {
			formatter.error('Agent frontmatter validation failed.');
			if (strict && results.warningCount > 0 && results.errorCount === 0) {
				formatter.warn('Strict mode is enabled: warnings are treated as failures.');
			}
		}
	}

	if (exitWithFailure) {
		process.exitCode = 1;
	}
}

if (require.main === module) {
	runCli().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

module.exports = {
	findFrontmatter,
	validateAgents
};
