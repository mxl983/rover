import { describe, it, expect } from "vitest";
import { getPlatformHint } from "./userAgentPlatform.js";

describe("getPlatformHint", () => {
  it("returns null for empty", () => {
    expect(getPlatformHint("")).toBeNull();
    expect(getPlatformHint(null)).toBeNull();
  });

  it("detects common platforms", () => {
    expect(getPlatformHint("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(getPlatformHint("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("iPad");
    expect(getPlatformHint("Mozilla/5.0 (Linux; Android 13)")).toBe("Android");
    expect(getPlatformHint("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("MacBook");
    expect(getPlatformHint("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(getPlatformHint("Mozilla/5.0 (X11; CrOS x86_64)")).toBe("Chrome OS");
    expect(getPlatformHint("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });
});
