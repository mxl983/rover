import { describe, it, expect, vi, beforeEach } from "vitest";

const connectMock = vi.hoisted(() => vi.fn());

vi.mock("mqtt", () => ({
  default: {
    connect: connectMock,
  },
}));

import mqtt from "mqtt";
import { MqttService } from "./mqttService.js";

describe("MqttService", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("connect creates client and subscribes on connect", () => {
    const handlers = {};
    const fakeClient = {
      on: vi.fn((ev, fn) => {
        handlers[ev] = fn;
      }),
      subscribe: vi.fn((topic, cb) => cb(null)),
      publish: vi.fn((topic, msg, opts, cb) => (cb ? cb(null) : undefined)),
    };
    connectMock.mockReturnValue(fakeClient);

    const svc = new MqttService();
    svc.connect({
      host: "localhost",
      port: 1883,
      protocol: "mqtt",
      rejectUnauthorized: false,
    });

    expect(mqtt.connect).toHaveBeenCalled();
    handlers.connect();
    expect(fakeClient.subscribe).toHaveBeenCalledWith("rover/commands/#", expect.any(Function));
  });

  it("publish no-ops when disconnected", () => {
    const fakeClient = {
      on: vi.fn(),
      subscribe: vi.fn(),
      publish: vi.fn(),
    };
    connectMock.mockReturnValue(fakeClient);
    const svc = new MqttService();
    svc.connect({
      host: "localhost",
      port: 1883,
      protocol: "mqtt",
      rejectUnauthorized: false,
    });
    svc.publish("t", "x");
    expect(fakeClient.publish).not.toHaveBeenCalled();
  });
});
