# Oracle Deploy Orchestration — Staged Loop

You are one node in a self-continuing loop. THIS FILE is the whole program.
Each run executes EXACTLY ONE numbered stage, then rewrites the STATE block
below and stops with a one-line pointer to this file. ALWAYS output the full
rewritten prompt (this file, including the updated STATE block) in the chat
at the end of every run — the operator reads it there, not in the file. Never
execute more than one stage per run. Never skip, merge, or reorder stages.

## Task

Orchestrate deployment of the remote-crawler-v2 server to the Oracle VM
(141.144.193.218, pm2 `crawl-server-v4`) from the Cowork sandbox: sandbox-side
build → scp → detached remote install → buildId verification, with a
pending-queue safety checkpoint before any restart. Context:
`docs/sessions/2026-07-01-crawler-usable-quality-loop/CONTINUATION_PROMPT.md`
("Remote fleet" section) and `tools/crawl/AGENT.md` lines ~49/356-366/875-916.
Hard rails: no restart of the remote service without explicit operator
approval in-chat; never place the operator's own private key in the sandbox.

## How stages are numbered (deterministic)

Stage 0 is always sizing the plan (P planning stages, min 2 max 6, fixed once
written). Stages 1..P are planning; each produces one written artifact named
in its title. Stage P+1 sizes the implementation (M stages, min 1 max 8,
fixed once written). Stages P+2..P+M+1 are implementation; one bounded,
verified change each. Stage P+M+2 is closeout.

## Rules for every run

1. Read STATE. The stage on the `next:` line is the only work permitted.
2. Verify the previous stage's claim before building on it; if it is false,
   redo that stage instead (same number — the numbering never shifts).
3. Do the stage. Small is correct; if it feels large, you are doing more
   than one stage.
4. Rewrite the STATE block: move the finished stage to `done:` with a
   five-word result, advance `next:`, update `notes:` (keep it under 4
   lines — it is the only memory).
5. Stop with a one-line pointer. If `next:` says DONE, say so and stop —
   do not invent work.

## STATE (plain text; rewrite in place every run; keep under 15 lines)

```
task: deploy remote-crawler-v2 to Oracle VM from sandbox, safely, in bounded calls
stage counts: P=5 M=unset
next: stage 5 — verification + rollback checklist
done: stage 0 — plan sized, five concerns; stage 1 — ssh bootstrap note
  written; stage 2 — build pipeline measured, chunked; stage 3 — queue is
  DB-backed, restart-safe; stage 4 — detached protocol designed, gated
done artifacts: stage1-ssh-bootstrap.md, stage2-sandbox-build.md,
  stage3-pending-queue-safety.md, stage4-chunked-deploy-protocol.md (this dir)
planning stages: 1 ssh-bootstrap note; 2 sandbox-build note; 3 pending-queue
  safety checklist; 4 chunked-deploy protocol note; 5 verify+rollback checklist
implementation stages: (set at stage 6)
notes: deploy key present, NOT yet authorized; server build 20260527035514;
  pending queue is DB-backed, TOTAL 4176 (bbc 1273, guardian 1482, apnews
  1023, npr 398), install script preserves data/; build needs
  --skip-busy-check + chunking (/tmp/db-build + --db-module-dir); remote
  nohup survives call caps, sandbox procs do not
```
