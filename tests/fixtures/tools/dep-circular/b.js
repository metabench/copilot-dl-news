'use strict';

const circleA = require('./a');

exports.circleB = function circleB() {
  return 'B';
};

exports.callA = function callA() {
  return circleA.circleA();
};
