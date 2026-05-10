'use strict';

const {
  getStageState,
  getAllStageStates,
  initStage,
  updateStageProgress,
  markStageComplete,
  markStageFailed,
  resetAllStages,
  getPlaceCountsByKind,
  getTotalPlaceCount
} = require('news-crawler-db');

module.exports = {
  getStageState,
  getAllStageStates,
  initStage,
  updateStageProgress,
  markStageComplete,
  markStageFailed,
  resetAllStages,
  getPlaceCountsByKind,
  getTotalPlaceCount
};
