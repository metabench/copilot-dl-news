"use strict";

const PRESET_DAYS = Object.freeze({
  "24h": 1,
  "7d": 7,
  "30d": 30,
});

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateString(parsed);
}

function resolvePresetDateRange(preset, startDate, endDate, now = new Date()) {
  const requested = typeof preset === "string" && preset.trim() ? preset.trim() : "7d";
  const explicitStart = normalizeDate(startDate);
  const explicitEnd = normalizeDate(endDate);

  if (explicitStart || explicitEnd) {
    return {
      datePreset: "custom",
      startDate: explicitStart,
      endDate: explicitEnd,
    };
  }

  if (requested === "all") {
    return { datePreset: "all", startDate: null, endDate: null };
  }

  const days = PRESET_DAYS[requested] || PRESET_DAYS["7d"];
  const end = new Date(now.getTime());
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    datePreset: PRESET_DAYS[requested] ? requested : "7d",
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

module.exports = { resolvePresetDateRange };