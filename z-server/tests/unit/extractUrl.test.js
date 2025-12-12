"use strict";

const { extractUrl } = require("../../ui/lib/extractUrl");

describe("extractUrl", () => {
  test("returns null for non-strings", () => {
    expect(extractUrl(null)).toBe(null);
    expect(extractUrl(undefined)).toBe(null);
    expect(extractUrl(123)).toBe(null);
  });

  test("extracts localhost URL", () => {
    expect(extractUrl("Server running at http://localhost:3000")).toBe("http://localhost:3000");
    expect(extractUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
  });

  test("extracts 127.0.0.1 URL", () => {
    expect(extractUrl("Listening: http://127.0.0.1:8080/foo")).toBe("http://127.0.0.1:8080/foo");
  });

  test("extracts 0.0.0.0 URL", () => {
    expect(extractUrl("listening on http://0.0.0.0:3000")).toBe("http://0.0.0.0:3000");
  });

  test("prefers first match", () => {
    const text = "available at http://localhost:3000 and also http://localhost:4000";
    expect(extractUrl(text)).toBe("http://localhost:3000");
  });
});
