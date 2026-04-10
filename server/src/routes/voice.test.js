import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../services/voiceAssistantService.js", () => ({
  interpretVoiceTranscript: vi.fn(),
}));

vi.mock("../utils/sysUtils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, speak: vi.fn() };
});

import { createHttpApp } from "../createHttpApp.js";
import { interpretVoiceTranscript } from "../services/voiceAssistantService.js";
import { stateService } from "../services/stateService.js";
import { speak } from "../utils/sysUtils.js";

describe("/api/voice", () => {
  beforeEach(() => {
    vi.mocked(interpretVoiceTranscript).mockReset();
    stateService.quietMode = true;
  });

  it("400 when transcript empty", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/voice/interpret").send({ transcript: "   " });
    expect(res.status).toBe(400);
  });

  it("200 with reply from assistant", async () => {
    vi.mocked(interpretVoiceTranscript).mockResolvedValue({
      replyText: "ok",
      action: null,
    });
    const app = createHttpApp();
    const res = await request(app).post("/api/voice/interpret").send({ transcript: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.replyText).toBe("ok");
  });

  it("502 when assistant throws", async () => {
    vi.mocked(interpretVoiceTranscript).mockRejectedValue(new Error("api down"));
    const app = createHttpApp();
    const res = await request(app).post("/api/voice/interpret").send({ transcript: "hello" });
    expect(res.status).toBe(502);
  });
});
