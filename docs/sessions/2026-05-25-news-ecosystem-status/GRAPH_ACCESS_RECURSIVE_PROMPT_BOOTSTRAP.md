# GraphAccess Recursive Prompt Bootstrap

Use this prompt to start the recursive planning process for GraphAccess and DB-backed graph analysis.

```text
Continue in /mnt/c/Users/james/Documents/repos/copilot-dl-news.

Read:
- AGENTS.md
- docs/sessions/2026-05-25-news-ecosystem-status/GRAPH_ACCESS_AND_ANALYSIS_IMPLEMENTATION_PLAN.md
- docs/sessions/2026-05-25-news-ecosystem-status/DB_QUERY_AND_ANALYSIS_FOCUS.md
- docs/sessions/2026-05-25-news-ecosystem-status/WORKING_NOTES.md

Task:
Review and improve the saved GraphAccess and analysis implementation plan. Keep the detailed plan in the session documents, not in chat. Update the plan where it needs correction, better sequencing, clearer repo boundaries, better tests, or better low-storage graph-analysis design.

Then return a single concise copy/paste prompt for the next session. That returned prompt must instruct the next runner to:
1. read the improved saved plan,
2. split the work into exactly 16 recursive implementation steps,
3. save that 16-step plan in the same session folder,
4. return a concise copy/paste prompt for starting Step 1 only,
5. require every future step to update the saved documents and return the next concise copy/paste prompt until all 16 steps are complete.

Do not implement GraphAccess yet in this review step. This step is planning and recursive prompt setup only.
```

## Updated Copy/Paste Prompt After Review

```text
Continue in /mnt/c/Users/james/Documents/repos/copilot-dl-news.

Read:
- AGENTS.md
- docs/sessions/2026-05-25-news-ecosystem-status/GRAPH_ACCESS_AND_ANALYSIS_IMPLEMENTATION_PLAN.md
- docs/sessions/2026-05-25-news-ecosystem-status/DB_QUERY_AND_ANALYSIS_FOCUS.md
- docs/sessions/2026-05-25-news-ecosystem-status/WORKING_NOTES.md

Task:
Create the recursive execution plan for GraphAccess and DB-backed graph analysis. Do not implement GraphAccess yet.

Use the saved implementation plan as the source of truth. Split the work into exactly 16 implementation steps and save the detailed 16-step process in:
docs/sessions/2026-05-25-news-ecosystem-status/GRAPH_ACCESS_16_STEP_RECURSIVE_PLAN.md

Keep the saved plan detailed, but keep chat prompts concise and refer back to the saved documents.

After saving the 16-step plan, return one concise copy/paste prompt that starts Step 1 only. The Step 1 prompt must instruct the next runner to implement only Step 1, verify it, update the session documents, and then return the next concise copy/paste prompt for Step 2.

Mandatory recursive instruction:
Every future step must implement only its current numbered step, update the saved session documents, and return the next concise copy/paste prompt for the following step. Continue that cycle until all 16 steps are complete.
```
