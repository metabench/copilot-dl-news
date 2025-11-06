'use strict';

const circleB = require('./b');

exports.circleA = function circleA() {
  return 'A';
};

exports.callB = function callB() {
  return circleB.circleB();
};
