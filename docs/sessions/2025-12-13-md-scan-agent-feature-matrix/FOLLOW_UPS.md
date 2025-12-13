# Follow Ups – md-scan agent feature matrix + md-edit multi-file operations

- `md-edit`: support batch mode from multiple positional files (no `--dir`) for small, explicit file lists.
- `md-edit`: add `--allow-missing` to avoid failing batch operations when a section is absent in some files.
- `md-edit`: consider `--emit-diff` size limits / truncation controls for huge batches.
- `agent-matrix`: add filters (eg `--missing-frontmatter`, `--missing-tools`, `--tool docs-memory/*`) and a table/matrix renderer.
