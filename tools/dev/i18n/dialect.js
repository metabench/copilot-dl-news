'use strict';

const {
  getAliases,
  shouldUseChinese,
  containsChineseGlyph
} = require('./lexicon');

const CLI_OPTION_ALIASES = {
  'js-scan': [
    { option: '--lang', lexKeys: ['lang'], aliases: ['--语'] },
    { option: '--help', lexKeys: ['help'], aliases: ['--助', '--帮', '-h'] },
    { option: '--search', lexKeys: ['search'], aliases: ['--搜', '--查'] },
    { option: '--find-hash', lexKeys: ['hash'], aliases: ['--哈'] },
    { option: '--find-pattern', lexKeys: ['pattern'], aliases: ['--匹', '--型'] },
    { option: '--build-index', lexKeys: ['index'], aliases: ['--索'] },
    { option: '--dir', lexKeys: ['path'], aliases: ['--径'] },
    { option: '--limit', lexKeys: ['search_limit'], aliases: ['--限'] },
    { option: '--include-path', lexKeys: ['include_paths'], aliases: ['--含径'] },
    { option: '--exclude-path', lexKeys: ['exclude_path'], aliases: ['--除径'] },
    { option: '--include-deprecated', lexKeys: ['include_deprecated'], aliases: ['--含旧'] },
    { option: '--deprecated-only', lexKeys: ['deprecated_only'], aliases: ['--旧专'] },
    { option: '--exported', lexKeys: ['exports'], aliases: ['--出'] },
    { option: '--internal', lexKeys: ['internal'], aliases: ['--内'] },
    { option: '--async', lexKeys: ['async'], aliases: ['--异'] },
    { option: '--generator', lexKeys: ['generator'], aliases: ['--生'] },
    { option: '--view', lexKeys: ['view'], aliases: ['--视'] },
    { option: '--fields', lexKeys: ['fields'], aliases: ['--域'] },
    { option: '--follow-deps', lexKeys: ['follow_deps'], aliases: ['--依'] },
    { option: '--dep-depth', lexKeys: ['dependency_depth'], aliases: ['--层'] }
  ],
  'js-edit': [
    { option: '--lang', lexKeys: ['lang'] },
    { option: '--help', lexKeys: ['help'], aliases: ['--助', '--帮', '-h'] },
    { option: '--file', lexKeys: ['file'] },
    { option: '--list-functions', lexKeys: ['list_functions'] },
    { option: '--list-constructors', lexKeys: ['list_constructors'] },
    { option: '--list-variables', lexKeys: ['list_variables'] },
    { option: '--outline', lexKeys: ['outline'] },
    { option: '--function-summary', lexKeys: ['function_summary'] },
    { option: '--filter-text', lexKeys: ['filter_text'] },
    { option: '--match', lexKeys: ['match'] },
    { option: '--exclude', lexKeys: ['exclude'] },
    { option: '--include-paths', lexKeys: ['include_paths'] },
    { option: '--include-internals', lexKeys: ['include_internals'] },
    { option: '--list-output', lexKeys: ['list_output'] },
    { option: '--context-function', lexKeys: ['context_function'] },
    { option: '--context-variable', lexKeys: ['context_variable'] },
    { option: '--context-before', lexKeys: ['context_before'] },
    { option: '--context-after', lexKeys: ['context_after'] },
    { option: '--context-enclosing', lexKeys: ['enclosing'] },
    { option: '--preview', lexKeys: ['preview'] },
    { option: '--preview-variable', lexKeys: ['preview_variable'] },
    { option: '--preview-chars', lexKeys: ['preview_chars'] },
    { option: '--preview-edit', lexKeys: ['preview_edit'] },
    { option: '--snipe', lexKeys: ['snipe'] },
    { option: '--search-text', lexKeys: ['search_text'] },
    { option: '--search-limit', lexKeys: ['search_limit'] },
    { option: '--search-context', lexKeys: ['search_context'] },
    { option: '--scan-targets', lexKeys: ['scan_targets'] },
    { option: '--scan-target-kind', lexKeys: ['scan_target_kind'] },
    { option: '--locate', lexKeys: ['locate'] },
    { option: '--locate-variable', lexKeys: ['locate_variable'] },
    { option: '--extract', lexKeys: ['extract'] },
    { option: '--extract-variable', lexKeys: ['extract_variable'] },
    { option: '--extract-hashes', lexKeys: ['extract_hashes'] },
    { option: '--replace', lexKeys: ['replace'] },
    { option: '--replace-variable', lexKeys: ['replace_variable'] },
    { option: '--with', lexKeys: ['with'] },
    { option: '--with-file', lexKeys: ['with_file'] },
    { option: '--with-code', lexKeys: ['with_code'] },
    { option: '--replace-range', lexKeys: ['replace_range'] },
    { option: '--rename', lexKeys: ['rename'] },
    { option: '--variable-target', lexKeys: ['variable_target'] },
    { option: '--output', lexKeys: ['output'] },
    { option: '--fix', lexKeys: ['fix'] },
    { option: '--json', lexKeys: ['json'] },
    { option: '--quiet', lexKeys: ['quiet'] },
    { option: '--emit-diff', lexKeys: ['emit_diff'] },
    { option: '--emit-plan', lexKeys: ['emit_plan'] },
    { option: '--emit-digests', lexKeys: ['emit_digests'] },
    { option: '--emit-digest-dir', lexKeys: ['digest_dir'] },
    { option: '--digest-include-snippets', lexKeys: ['digest_include_snippets'] },
    { option: '--no-digests', lexKeys: ['no_digests'] },
    { option: '--force', lexKeys: ['force'] },
    { option: '--allow-multiple', lexKeys: ['allow_multiple'] },
    { option: '--expect-hash', lexKeys: ['expect_hash'] },
    { option: '--expect-span', lexKeys: ['expect_span'] },
    { option: '--select', lexKeys: ['select'] },
    { option: '--select-path', lexKeys: ['select_path'] },
    { option: '--benchmark', lexKeys: ['benchmark'] }
  ],
  'md-scan': [
    { option: '--lang', lexKeys: ['lang'] },
    { option: '--help', lexKeys: ['help'], aliases: ['--助', '--帮', '-h'] },
    { option: '--dir', lexKeys: ['path'] },
    { option: '--exclude', lexKeys: ['exclude'] },
    { option: '--search', lexKeys: ['search'] },
    { option: '--find-sections', lexKeys: ['find_sections'] },
    { option: '--build-index', lexKeys: ['index'] },
    { option: '--map-links', lexKeys: ['map_links'] },
    { option: '--priority-only', lexKeys: ['priority_only'] },
    { option: '--case-sensitive', lexKeys: ['case_sensitive'] },
    { option: '--search-limit', lexKeys: ['search_limit'] },
    { option: '--compact', lexKeys: ['compact'] },
    { option: '--json', lexKeys: ['json'] },
    { option: '--verbose', lexKeys: ['verbose'] }
  ],
  'md-edit': [
    { option: '--lang', lexKeys: ['lang'] },
    { option: '--help', lexKeys: ['help'], aliases: ['--助', '--帮', '-h'] },
    { option: '--list-sections', lexKeys: ['list_sections'] },
    { option: '--list-code-blocks', lexKeys: ['list_code_blocks'] },
    { option: '--outline', lexKeys: ['outline'] },
    { option: '--stats', lexKeys: ['stats'] },
    { option: '--search', lexKeys: ['search'] },
    { option: '--search-headings', lexKeys: ['search_headings'] },
    { option: '--search-limit', lexKeys: ['search_limit'] },
    { option: '--match', lexKeys: ['match'] },
    { option: '--exclude', lexKeys: ['exclude'] },
    { option: '--level', lexKeys: ['level'] },
    { option: '--min-level', lexKeys: ['min_level'] },
    { option: '--max-level', lexKeys: ['max_level'] },
    { option: '--show-section', lexKeys: ['show_section'] },
    { option: '--context-lines', lexKeys: ['context_lines'] },
    { option: '--with-neighbors', lexKeys: ['with_neighbors'] },
    { option: '--emit-plan', lexKeys: ['emit_plan'] },
    { option: '--remove-section', lexKeys: ['remove_section'] },
    { option: '--extract-section', lexKeys: ['extract_section'] },
    { option: '--replace-section', lexKeys: ['replace_section'] },
    { option: '--with', lexKeys: ['with'] },
    { option: '--with-file', lexKeys: ['with_file'] },
    { option: '--expect-hash', lexKeys: ['expect_hash'] },
    { option: '--allow-multiple', lexKeys: ['allow_multiple'] },
    { option: '--fix', lexKeys: ['fix'] },
    { option: '--output', lexKeys: ['output'] },
    { option: '--json', lexKeys: ['json'] },
    { option: '--compact', lexKeys: ['compact'] },
    { option: '--verbose', lexKeys: ['verbose'] }
  ]
};

function buildAliasContext(toolName) {
  const entries = CLI_OPTION_ALIASES[toolName] || [];
  const aliasMap = new Map();
  const canonicalLex = new Map();

  for (const entry of entries) {
    const canonical = ensureOptionFormat(entry.option);
    canonicalLex.set(canonical, Array.isArray(entry.lexKeys) ? entry.lexKeys : []);

    const aliasSet = new Set();

    if (Array.isArray(entry.aliases)) {
      entry.aliases.forEach((alias) => {
        if (alias) {
          aliasSet.add(alias);
        }
      });
    }

    if (Array.isArray(entry.lexKeys)) {
      entry.lexKeys.forEach((key) => {
        getAliases(key).forEach((alias) => {
          aliasSet.add(`--${alias}`);
        });
      });
    }

    aliasSet.forEach((alias) => {
      const normalizedAlias = normalizeOption(alias);
      aliasMap.set(normalizedAlias, canonical);
    });
  }

  return { aliasMap, canonicalLex };
}

function translateToken(token, aliasMap, canonicalLex) {
  if (typeof token !== 'string') {
    return { value: token, aliasUsed: false, canonical: null };
  }

  const eqIndex = token.indexOf('=');
  const flagPart = eqIndex === -1 ? token : token.slice(0, eqIndex);
  const valuePart = eqIndex === -1 ? null : token.slice(eqIndex + 1);
  const normalizedFlag = normalizeOption(flagPart);
  const mapped = aliasMap.get(normalizedFlag);

  if (mapped) {
    const replacement = valuePart === null ? mapped : `${mapped}=${valuePart}`;
    return { value: replacement, aliasUsed: true, canonical: mapped };
  }

  const canonicalCandidate = canonicalLex.has(normalizedFlag) ? normalizedFlag : null;
  return { value: token, aliasUsed: false, canonical: canonicalCandidate };
}

function translateCliArgs(toolName, argv) {
  const { aliasMap, canonicalLex } = buildAliasContext(toolName);
  const normalized = [];
  let aliasUsed = false;
  let glyphDetected = false;
  const touchedLexKeys = new Set();
  const touchedOptions = new Set();

  const tokens = Array.isArray(argv) ? argv : [];

  for (const token of tokens) {
    const translation = translateToken(token, aliasMap, canonicalLex);
    if (translation.aliasUsed) {
      aliasUsed = true;
    }
    if (!aliasUsed && containsChineseGlyph(String(token || ''))) {
      glyphDetected = true;
    }

    if (translation.canonical) {
      touchedOptions.add(translation.canonical);
      const lexKeys = canonicalLex.get(translation.canonical) || [];
      lexKeys.forEach((key) => touchedLexKeys.add(key));
    }

    normalized.push(translation.value);
  }

  if (!aliasUsed && !glyphDetected) {
    if (shouldUseChinese(tokens)) {
      glyphDetected = true;
    }
  }

  return {
    argv: normalized,
    aliasUsed,
    glyphDetected,
    lexKeys: Array.from(touchedLexKeys),
    canonicalOptions: Array.from(touchedOptions)
  };
}

function ensureOptionFormat(option) {
  if (typeof option !== 'string') {
    return option;
  }
  if (option.startsWith('--')) {
    return option;
  }
  if (option.startsWith('-')) {
    return `-${option.replace(/^-+/, '')}`;
  }
  return `--${option}`;
}

function normalizeOption(option) {
  if (typeof option !== 'string') {
    return option;
  }
  if (!option.startsWith('-')) {
    return option;
  }
  const eqIndex = option.indexOf('=');
  const flagPart = eqIndex === -1 ? option : option.slice(0, eqIndex);
  const suffix = eqIndex === -1 ? '' : option.slice(eqIndex);
  const trimmed = flagPart.replace(/^-+/, '');
  return `--${trimmed}${suffix}`;
}

module.exports = {
  translateCliArgs
};
