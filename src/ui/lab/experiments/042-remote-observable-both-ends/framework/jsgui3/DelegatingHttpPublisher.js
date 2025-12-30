"use strict";

let HTTP_Publisher;
try {
  HTTP_Publisher = require("jsgui3-server/publishers/http-publisher");
} catch {
  HTTP_Publisher = null;
}

class DelegatingHttpPublisher extends (HTTP_Publisher || class {}) {
  constructor({ type, handler } = {}) {
    super({});

    if (typeof handler !== "function") {
      throw new Error("DelegatingHttpPublisher requires a handler function");
    }

    this.type = type || "delegate";
    this.handle_http = handler;
  }
}

module.exports = {
  DelegatingHttpPublisher,
};
