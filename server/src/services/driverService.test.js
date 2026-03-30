import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("python-shell", () => ({
  PythonShell: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: sendMock,
  })),
}));

vi.mock("./autoDocker.js", () => ({
  AutoDocker: vi.fn().mockImplementation(() => ({})),
}));

import { PythonShell } from "python-shell";
import { DriverService } from "./driverService.js";

describe("DriverService", () => {
  beforeEach(() => {
    sendMock.mockClear();
    vi.mocked(PythonShell).mockClear();
  });

  it("sendMoveCommand no-ops without motor shell", () => {
    const d = new DriverService();
    d.motorShell = null;
    d.sendMoveCommand({ keys: ["w"] });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sendMoveCommand forwards JSON to motor shell", () => {
    const d = new DriverService();
    d.motorShell = { send: sendMock };
    d.sendMoveCommand({ keys: ["w"] });
    expect(sendMock).toHaveBeenCalledWith(JSON.stringify({ keys: ["w"] }));
  });

  it("setBroadcast stores function", () => {
    const d = new DriverService();
    const fn = vi.fn();
    d.setBroadcast(fn);
    d.broadcast({ x: 1 });
    expect(fn).toHaveBeenCalledWith({ x: 1 });
  });
});
