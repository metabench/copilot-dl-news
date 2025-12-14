// Browser shim for htmlparser - parse_mount only.
module.exports = {
  Parser: function() { this.parseComplete = function() {}; },
  DefaultHandler: function() {}
};
