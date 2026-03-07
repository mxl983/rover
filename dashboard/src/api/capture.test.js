import { describe, it, expect } from "vitest";
import { isAllowedCaptureUrl } from "./capture";

describe("isAllowedCaptureUrl", () => {
  it("returns false for empty or non-string", () => {
    expect(isAllowedCaptureUrl("")).toBe(false);
    expect(isAllowedCaptureUrl(null)).toBe(false);
    expect(isAllowedCaptureUrl(undefined)).toBe(false);
  });

  it("returns false for URL with different origin", () => {
    expect(isAllowedCaptureUrl("https://evil.com/path")).toBe(false);
    expect(isAllowedCaptureUrl("https://other.com/capture.jpg")).toBe(false);
  });

  it("returns true for same origin URL", () => {
    const base = "https://rover.tail9d0237.ts.net:3000";
    expect(isAllowedCaptureUrl(`${base}/api/camera/capture/123.jpg`)).toBe(true);
    expect(isAllowedCaptureUrl(`${base}/anything`)).toBe(true);
  });
});
