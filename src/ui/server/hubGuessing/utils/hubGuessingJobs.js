'use strict';

const fs = require('fs');
const path = require('path');

function createHubGuessingJobStore({ jobsFile, statusFile, maxJobs = 50 } = {}) {
  if (!jobsFile || !statusFile) {
    throw new Error('createHubGuessingJobStore requires jobsFile and statusFile');
  }

  const jobs = new Map();

  function loadJobs() {
    try {
      if (!fs.existsSync(jobsFile)) return;
      const data = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
      if (!Array.isArray(data)) return;

      for (const job of data) {
        if (!job || !job.id) continue;
        if (job.status === 'running' || job.status === 'pending') {
          job.status = 'failed';
          job.error = 'Server restarted';
          job.endTime = new Date().toISOString();
        }
        jobs.set(job.id, job);
      }
    } catch (err) {
      // Swallow load errors; caller logs if needed.
    }
  }

  function saveJobs() {
    try {
      const list = Array.from(jobs.values());
      const sorted = list.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      const toSave = sorted.slice(0, maxJobs);

      if (sorted.length > maxJobs) {
        const toRemove = sorted.slice(maxJobs);
        for (const job of toRemove) {
          jobs.delete(job.id);
        }
      }

      fs.writeFileSync(jobsFile, JSON.stringify(toSave, null, 2));
    } catch (err) {
      // Swallow save errors; caller logs if needed.
    }
  }

  function writeStatus(jobId, status, data = {}) {
    try {
      const dir = path.dirname(statusFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const content = {
        jobId,
        status,
        updatedAt: Date.now(),
        pid: process.pid,
        ...data
      };
      fs.writeFileSync(statusFile, JSON.stringify(content, null, 2));
    } catch (err) {
      // Swallow write errors; caller logs if needed.
    }
  }

  function clearStatus() {
    try {
      if (fs.existsSync(statusFile)) {
        fs.unlinkSync(statusFile);
      }
    } catch (err) {
      // Swallow clear errors; caller logs if needed.
    }
  }

  return {
    jobs,
    loadJobs,
    saveJobs,
    writeStatus,
    clearStatus
  };
}

module.exports = {
  createHubGuessingJobStore
};
