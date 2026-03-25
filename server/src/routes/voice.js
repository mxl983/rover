import express from "express";
import { asyncHandler, badRequest, error, success } from "../utils/apiResponse.js";
import { interpretVoiceTranscript } from "../services/voiceAssistantService.js";
import { stateService } from "../services/stateService.js";
import { speak } from "../utils/sysUtils.js";

const router = express.Router();

router.post(
  "/interpret",
  asyncHandler(async (req, res) => {
    const transcript = String(req.body?.transcript ?? "").trim();
    const recentContext = String(req.body?.recentContext ?? "").trim();
    if (!transcript) {
      return badRequest(res, "transcript is required");
    }

    try {
      const result = await interpretVoiceTranscript({
        transcript,
        recentContext,
        health: stateService.getHealth?.() ?? null,
      });
      if (!stateService.quietMode && result.replyText) {
        const speakText = String(result.replyText).trim().slice(0, 180);
        if (speakText) {
          const hasCjk = /[\u3040-\u30ff\u4e00-\u9fff]/.test(speakText);
          const lang = hasCjk ? "zh" : "en";
          speak(speakText, { language: lang, speed: 150 });
        }
      }
      return success(res, { replyText: result.replyText, action: result.action });
    } catch (e) {
      return error(res, `Voice interpret failed: ${e.message}`, 502);
    }
  }),
);

export default router;

