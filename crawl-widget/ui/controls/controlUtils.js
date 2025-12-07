"use strict";

function getBodyControl(context) {
  return context?.map_controls?.["body_0"] || context?.body || null;
}

module.exports = { getBodyControl };
