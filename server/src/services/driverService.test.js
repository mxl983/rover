import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
const playSystemAudioMock = vi.hoisted(() => vi.fn());
const speakMock = vi.hoisted(() => vi.fn());

vi.mock("../utils/sysUtils.js", () => ({
  playSystemAudio: playSystemAudioMock,
  speak: speakMock,
}));

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
    playSystemAudioMock.mockClear();
    speakMock.mockClear();
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

  it("sendMoveCommand meow plays audio then speaks 芒果 twice without motor JSON", () => {
    const d = new DriverService();
    d.motorShell = { send: sendMock };
    d.sendMoveCommand({ command: "meow", quietMode: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(playSystemAudioMock).toHaveBeenCalledWith("meow.mp3", expect.any(Function));
    const onDone = playSystemAudioMock.mock.calls[0][1];
    onDone();
    expect(speakMock).toHaveBeenCalledWith("芒果，芒果", {
      language: "zh",
      volume: "+5%",
    });
  });

  it("setBroadcast stores function", () => {
    const d = new DriverService();
    const fn = vi.fn();
    d.setBroadcast(fn);
    d.broadcast({ x: 1 });
    expect(fn).toHaveBeenCalledWith({ x: 1 });
  });
});
