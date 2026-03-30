import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoDocker } from "./autoDocker.js";

describe("AutoDocker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processOffset no-ops when busy", async () => {
    const send = vi.fn();
    const dock = new AutoDocker(send);
    dock.isBusy = true;
    await dock.processOffset({ x: 10, y: 10, r: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("processOffset no-ops when offset missing", async () => {
    const send = vi.fn();
    const dock = new AutoDocker(send);
    await dock.processOffset(null);
    expect(send).not.toHaveBeenCalled();
  });

  it("executeStep sends keys and clears", async () => {
    const send = vi.fn();
    const dock = new AutoDocker(send);
    const p = dock.executeStep(["w"], 200);
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(send).toHaveBeenCalled();
  });
});
