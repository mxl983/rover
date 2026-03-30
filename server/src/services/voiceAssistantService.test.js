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
});
