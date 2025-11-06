'use strict';

const helper = require('../dep-linked/helper');

exports.entryPoint = function entryPoint() {
  return helper.helperOne();
};

exports.loopViaHelper = function loopViaHelper() {
  return helper.helperTwo();
};
