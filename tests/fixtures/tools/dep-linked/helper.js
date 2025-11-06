'use strict';

const circular = require('../dep-circular/a');

exports.helperOne = function helperOne() {
  return 'linked';
};

exports.helperTwo = function helperTwo() {
  return circular.circleA();
};
