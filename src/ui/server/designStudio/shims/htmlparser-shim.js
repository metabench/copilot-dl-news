
// Browser shim for htmlparser - not needed on client side
// HTML parsing is only used server-side for parse_mount
module.exports = {
  Parser: function() { 
    this.parseComplete = function() { console.warn('htmlparser not available in browser'); };
  },
  DefaultHandler: function() {}
};
