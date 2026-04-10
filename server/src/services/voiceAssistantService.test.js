import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config.js", () => ({
  default: {
    env: "test",
    deepseek: {
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      model: "test-model",
      timeoutMs: 5000,
    },
    voiceLlmDebug: false,
    voiceDrive: {
      estimatedLinearSpeedMps: 0.2,
      estimatedTurnDegPerSec: 85,
      maxTimedDriveMs: 15_000,
    },
  },
}));

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from "axios";
import { interpretVoiceTranscript } from "./voiceAssistantService.js";

describe("interpretVoiceTranscript", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("returns parsed reply and action from model JSON", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: '{"replyText":"你好","action":{"type":"none"}}',
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({ transcript: "hello", health: {} });
    expect(out.replyText).toBe("你好");
    expect(out.action).toBeNull();
  });

  it("keeps per-step LLM durations when transcript has multiple distances (compound move)", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                replyText: "ok",
                action: {
                  type: "sequence",
                  actions: [
                    {
                      type: "control",
                      drive: { x: 0, y: -0.85 },
                      durationMs: 5000,
                    },
                    {
                      type: "control",
                      drive: { x: 0, y: 0 },
                      durationMs: 200,
                    },
                    {
                      type: "control",
                      drive: { x: -0.85, y: 0 },
                      durationMs: 1000,
                    },
                    {
                      type: "control",
                      drive: { x: 0, y: 0 },
                      durationMs: 200,
                    },
                    {
                      type: "control",
                      drive: { x: 0, y: -0.85 },
                      durationMs: 1000,
                    },
                    {
                      type: "control",
                      drive: { x: 0, y: 0 },
                      durationMs: 200,
                    },
                  ],
                },
              }),
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({
      transcript: "前进一米然后左转90度然后前进20厘米",
      health: {},
    });
    expect(out.action?.type).toBe("sequence");
    expect(out.action.actions[0].durationMs).toBe(5000);
    expect(out.action.actions[2].payload.command).toBe("turn_left_90_slow");
    expect(out.action.actions[4].durationMs).toBe(1000);
  });

  it("derives timed drive duration from 米 using estimated linear speed", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                '{"replyText":"ok","action":{"type":"control","drive":{"x":0,"y":-0.85},"durationMs":2000}}',
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({ transcript: "前进一米", health: {} });
    expect(out.action.type).toBe("control");
    expect(out.action.durationMs).toBe(5000);
  });

  it("prefers explicit 秒 over model durationMs", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                '{"replyText":"ok","action":{"type":"control","drive":{"x":0,"y":-0.85},"durationMs":8000}}',
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({ transcript: "前进两秒", health: {} });
    expect(out.action.durationMs).toBe(2000);
  });

  it("maps 右转90度 to calibrated turn_right_90_slow command", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                '{"replyText":"ok","action":{"type":"control","drive":{"x":0.85,"y":0},"durationMs":2000}}',
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({ transcript: "右转90度", health: {} });
    expect(out.action).toEqual({
      type: "control",
      payload: { command: "turn_right_90_slow" },
    });
  });

  it("accepts sequence.steps (alias of actions) and keeps gimbal step durations", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                replyText: "ok",
                action: {
                  type: "sequence",
                  steps: [
                    {
                      type: "control",
                      gimbal: { x: 0, y: 0.8 },
                      durationMs: 500,
                    },
                    {
                      type: "control",
                      gimbal: { x: 0, y: -0.8 },
                      durationMs: 500,
                    },
                    {
                      type: "control",
                      gimbal: { x: 0, y: 0 },
                      durationMs: 200,
                    },
                  ],
                },
              }),
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({
      transcript: "sequence steps alias gimbal",
      health: {},
    });
    expect(out.action?.type).toBe("sequence");
    expect(out.action.actions).toHaveLength(3);
    expect(out.action.actions[0].durationMs).toBe(500);
    expect(out.action.actions[0].payload.gimbal.y).toBeCloseTo(0.8);
    expect(out.action.actions[2].durationMs).toBe(200);
  });

  it("short-circuits 摇摇头 without calling the LLM", async () => {
    vi.mocked(axios.post).mockClear();
    const out = await interpretVoiceTranscript({ transcript: "摇摇头", health: {} });
    expect(vi.mocked(axios.post).mock.calls.length).toBe(0);
    expect(out.replyText).toBe("好的。");
    expect(out.action?.type).toBe("sequence");
    expect(out.action.actions.some((s) => s.payload?.gimbal?.x !== 0)).toBe(true);
  });

  it("scales non-90° turn duration from 度 using estimated turn rate", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                '{"replyText":"ok","action":{"type":"control","drive":{"x":0.85,"y":0},"durationMs":2000}}',
            },
          },
        ],
      },
    });
    const out = await interpretVoiceTranscript({ transcript: "右转45度", health: {} });
    expect(out.action.type).toBe("control");
    expect(out.action.durationMs).toBe(Math.round((45 / 85) * 1000));
    expect(out.action.payload.drive.x).toBeGreaterThan(0);
  });
});
