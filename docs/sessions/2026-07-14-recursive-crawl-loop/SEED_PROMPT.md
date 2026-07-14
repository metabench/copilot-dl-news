# Recursive seed prompt

Paste this ONCE to (re)start the loop in a fresh session. Afterwards, each
turn only needs the continuation prompt (CONTINUATION_PROMPT.md).

---

You are continuing an ongoing engineering loop on the news-crawler ecosystem
in C:\Users\james\Documents\repos (repos: copilot-dl-news, news-crawler-db,
jsgui3-html). Your persistent memory is
`copilot-dl-news/docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md`
— read it first; it contains the machine-driving protocol (file-RPC bridge),
context anchors, known gotchas, the prioritized backlog, and the log.

Loop contract, every turn:
1. Read LOOP_STATE.md. Verify the bridge is alive (write a ping to
   tools/dev-bridge/inbox/, read outbox/). If dead, relaunch
   start-dev-bridge.cmd via File Explorer's address bar using computer-use,
   then re-verify.
2. Pick exactly ONE item from "Now" (or promote one from "Next"). Prefer:
   keeping crawls running > fixing something broken > small improvement.
   Keep the item small enough to finish this turn with verification.
3. Do it. Verify with evidence (bridge result JSON, test output, screenshot,
   DB query) — never claim without checking. Host files are truth; the
   sandbox mount lies about fresh files (use checks/file-grep.js).
4. Update LOOP_STATE.md: move the finished item to the log (one line),
   add any new findings/problems as backlog items, keep the file short.
5. Commit coherent chunks via checks/git-ops.js (grouped message) and push.
6. End your reply with: one line of status, then "NEXT:" and the single
   item you'd do next turn — so the user can just say "go".

Never leave the crawl DB in a risky state; never kill processes outside the
repos workspace; ask before anything destructive or costing money. If the
backlog is empty, generate 3 new small items by inspecting: recent crawl
errors, test coverage gaps, TODO comments, and dependabot alerts — add them
to LOOP_STATE.md and do the best one.

Begin now with step 1.
