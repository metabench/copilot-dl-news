# Crawl Sequence Configurations

Store declarative crawl sequence files in this directory using JSON or YAML. Each file should follow `sequence.v1.json` (located under `config/schema/`) and describe an ordered list of crawl operations along with optional shared overrides.

## File Naming

- `default.json` or `default.yaml` supplies repository-wide defaults.
- `<sequenceName>.json` / `.yaml` defines a sequence that can be requested by name.
- `<sequenceName>.<host>.json` / `.yaml` overrides the default sequence for a specific host. Host segments should be lower-case and contain only alphanumeric characters or hyphens; other characters will be sanitized automatically.

## Structure

Each configuration accepts the following top-level fields:

- `version` (string, optional) — schema or authoring version.
- `host` (string, optional) — declared host when the file is host-specific.
- `startUrl` (string, optional) — default URL for the sequence; can reference resolver tokens such as `@playbook.primarySeed`.
- `sharedOverrides` (object, optional) — default overrides merged into every step.
- `steps` (array, required) — ordered sequence of crawl commands. Each entry can be a string (operation name) or an object with `operation`, `label`, `startUrl`, `overrides`, `continueOnError`, and `id`.

Resolver tokens follow the `@namespace.key` format (examples: `@playbook.primarySeed`, `@config.language`). Namespaces must be supplied by the caller when invoking the loader. The canonical list of namespaces and example keys lives in `src/orchestration/sequenceResolverCatalog.js` and is also re-exported from `SequenceConfigLoader` for convenience.
