import { describe, expect, it } from "vitest";
import { isViewerRequest } from "./viewer.js";

const req = (path, hostname, t) => ({ path, hostname, query: { t } });

describe("isViewerRequest", () => {
  it("rejects a wrong or missing token", () => {
    expect(isViewerRequest(req("/viewer.html", "192.168.1.20", "nope"))).toBe(false);
    expect(isViewerRequest(req("/viewer/stream", "192.168.1.20", undefined))).toBe(false);
  });

  it("never opens other paths, even with any token", () => {
    expect(isViewerRequest(req("/api/translate", "192.168.1.20", "x".repeat(32)))).toBe(false);
  });

  it("rejects public hosts such as the tunnel", () => {
    expect(isViewerRequest(req("/viewer.html", "abc.trycloudflare.com", "x".repeat(32)))).toBe(
      false,
    );
  });
});
