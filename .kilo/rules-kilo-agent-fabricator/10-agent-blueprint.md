# Agent Blueprint Checklist

Follow this sequence whenever you craft a new Kilo mode:

1. **Clarify the task.** Summarize the requested workflow (one sentence) and map it to repo domains (e.g., `src/ui/controls`, `/scripts/perf`, `/docs/workflows`).
2. **Scan existing personas.** Use the repo tooling for quick discovery:
   - `node tools/dev/md-scan.js --dir docs --search <term> --json`
   - `node tools/dev/js-scan.js --what-calls <fn> --json`
3. **Draft the mode entry.** Extend `.kilocodemodes` (JSON today) with:
   - `slug`: lowercase kebab-case; matches `.kilo/rules-<slug>/`.
   - `name` + `description`: human readable summary referencing the task.
   - `roleDefinition`: cite the specific doc(s) or modules the mode must enforce.
   - `groups`: restrict writes via regex (Markdown-only for doc agents, e.g., `\.(md|mdx)$`).
   - `customInstructions`: remind future runs to update AGENTS.md + session docs after work.
4. **Author rules files.** Drop Markdown snippets into `.kilo/rules-<slug>/NN-topic.md`:
   - `00-overview`: responsibilities + guardrails.
   - `10-playbook`: steps/checklists.
   - `20-context`: repo-specific references, links, and required scripts.
5. **Document the change.** Update:
   - `docs/workflows/kilo-agent-handbook.md` if the process evolved.
   - `docs/sessions/<date>-<slug>/WORKING_NOTES.md` with what changed.
   - `AGENTS.md` quick-start pointers if the mode becomes standard.
6. **Verify.** Plan how future contributors can validate the new agent (e.g., "run `kilocode --mode <slug>` and confirm `[Memory Bank: Active]` appears").

Always respond with explicit file diffs or commands future agents can replay. If you need to inspect non-Markdown files, call `js-scan`/`js-edit` first.
