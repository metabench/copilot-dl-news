'use strict';

const { Control } = require('./jsgui');

/**
 * el — a plain tagged Control with a class and text.
 *
 * The framework's generic Control IS the div/span/h2 of this app; this is the
 * three-argument shorthand for it, so composing reads as structure rather than
 * as four lines of setup per element. Text goes through add(), which the
 * renderer escapes — the reason none of this app builds markup strings.
 */
function el(context, tag, cls, text) {
  const c = new Control({ context, tagName: tag });
  if (cls) c.add_class(cls);
  if (text !== undefined && text !== null) c.add(String(text));
  return c;
}

module.exports = { el };
