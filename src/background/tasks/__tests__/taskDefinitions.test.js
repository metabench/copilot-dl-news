'use strict';

// Guards the taskDefinitions ⇄ BUILTIN_TASKS reconciliation: the /types API
// (getTaskSummaries) must advertise exactly the task types that have a backing
// runtime class, so the property-editor UI never offers a task that fails on
// create. database-export / gazetteer-import / database-vacuum are schema-only
// (implemented:false) — kept for when their classes land, but not advertised.

const { getTaskSummaries, getAvailableTaskTypes, getTaskDefinition } = require('../taskDefinitions');
const { BUILTIN_TASKS } = require('../../../server/background-tasks/mountBackgroundTasks');

const SCHEMA_ONLY = ['database-export', 'gazetteer-import', 'database-vacuum'];

describe('taskDefinitions reconciliation with BUILTIN_TASKS', () => {
  it('advertises exactly the class-backed task types (no orphan defs, no missing classes)', () => {
    expect(getAvailableTaskTypes().slice().sort()).toEqual(Object.keys(BUILTIN_TASKS).slice().sort());
  });

  it('excludes schema-only (implemented:false) definitions from the advertised summaries', () => {
    const advertised = getTaskSummaries().map((s) => s.taskType);
    SCHEMA_ONLY.forEach((t) => expect(advertised).not.toContain(t));
    // sanity: a real one is still advertised
    expect(advertised).toContain('ingest-admin-areas');
  });

  it('keeps schema-only definitions retrievable (schema preserved for future classes)', () => {
    SCHEMA_ONLY.forEach((t) => {
      const def = getTaskDefinition(t);
      expect(def).toBeTruthy();
      expect(def.implemented).toBe(false);
      expect(Array.isArray(def.fields) && def.fields.length > 0).toBe(true);
    });
  });
});
