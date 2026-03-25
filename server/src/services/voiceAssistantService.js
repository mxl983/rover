import axios from "axios";
import config from "../config.js";

const ALLOWED_COMMANDS = new Set([
  "reset_servos",
  "look_down",
  "turn_left_90_slow",
  "turn_right_90_slow",
  "toggle_laser",
]);

/** Max steps in one sequence (LLM may decompose one utterance into many sub-actions). */
const MAX_SEQUENCE_STEPS = 10;

const CN_NUM = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function hasAny(text, patterns) {
  const s = String(text || "");
  return patterns.some((p) => p.test(s));
}

function parseCnNumber(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/u.test(t)) return Number(t);
  if (t.length === 1 && t in CN_NUM) return CN_NUM[t];
  if (t === "十") return 10;
  if (t.startsWith("十")) {
    const ones = CN_NUM[t.slice(1)] ?? 0;
    return 10 + ones;
  }
  const idx = t.indexOf("十");
  if (idx > 0) {
    const tens = CN_NUM[t.slice(0, idx)] ?? 1;
    const ones = CN_NUM[t.slice(idx + 1)] ?? 0;
    return tens * 10 + ones;
  }
  return null;
}

function parseSeconds(text) {
  const m = String(text || "").match(/([零一二两三四五六七八九十\d.]+)\s*秒/u);
  if (!m) return null;
  const n = parseCnNumber(m[1]);
  if (n == null || !Number.isFinite(n)) return null;
  return clamp(n * 1000, 350, 8000);
}

function stopDriveAction() {
  return { type: "control", payload: { drive: { x: 0, y: 0 } } };
}

function gimbalAction(x, y) {
  return {
    type: "control",
    payload: {
      gimbal: {
        x: clamp(x, -1, 1),
        y: clamp(y, -1, 1),
      },
    },
  };
}

function parseRepeatCount(text) {
  const m = String(text || "").match(/([零一二两三四五六七八九十\d]+)\s*次/u);
  if (!m) return null;
  const n = parseCnNumber(m[1]);
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(clamp(n, 1, MAX_SEQUENCE_STEPS));
}

function parseCircleMotion(text) {
  const t = String(text || "");
  if (!hasAny(t, [/画圈/u, /圆圈/u, /绕圈/u, /转圈/u])) return null;
  const durationMs = parseSeconds(t) ?? 2600;
  const left = hasAny(t, [/左/u, /逆时针/u]);
  const right = hasAny(t, [/右/u, /顺时针/u]);
  const x = left && !right ? -0.75 : 0.75; // default clockwise
  return {
    type: "sequence",
    actions: [
      { type: "control", payload: { drive: { x, y: -0.82 } }, durationMs },
      stopDriveAction(),
    ],
  };
}

function parseNodCamera(text) {
  const t = String(text || "");
  if (!hasAny(t, [/点头/u, /上下点/u, /上下看/u, /镜头点头/u])) return null;
  const repeat = parseRepeatCount(t) ?? 2;
  const actions = [];
  for (let i = 0; i < repeat; i += 1) {
    actions.push(gimbalAction(0, -0.85)); // up
    actions.push(gimbalAction(0, 0.85)); // down
  }
  actions.push(gimbalAction(0, 0));
  return { type: "sequence", actions: actions.slice(0, MAX_SEQUENCE_STEPS) };
}

function parseForwardBackwardCycle(text) {
  const t = String(text || "");
  if (
    !hasAny(t, [/前进/u, /向前/u, /往前/u]) ||
    !hasAny(t, [/后退/u, /向后/u, /往后/u])
  ) {
    return null;
  }
  const repeat = parseRepeatCount(t) ?? 1;
  const durationMs = parseSeconds(t) ?? 1200;
  const actions = [];
  for (let i = 0; i < repeat; i += 1) {
    actions.push({
      type: "control",
      payload: { drive: { x: 0, y: -0.92 } }, // forward is negative y per rover mapping
      durationMs,
    });
    actions.push(stopDriveAction());
    actions.push({
      type: "control",
      payload: { drive: { x: 0, y: 0.92 } }, // backward is positive y
      durationMs,
    });
    actions.push(stopDriveAction());
  }
  return { type: "sequence", actions: actions.slice(0, MAX_SEQUENCE_STEPS) };
}

function parseClauseAction(clause) {
  const t = String(clause || "").trim();
  if (!t) return null;
  const durationMs = parseSeconds(t) ?? 1200;

  if (hasAny(t, [/前进/u, /向前/u, /往前/u])) {
    return { type: "control", payload: { drive: { x: 0, y: -0.92 } }, durationMs };
  }
  if (hasAny(t, [/后退/u, /向后/u, /往后/u])) {
    return { type: "control", payload: { drive: { x: 0, y: 0.92 } }, durationMs };
  }
  if (hasAny(t, [/左转/u, /向左/u, /往左/u])) {
    return { type: "control", payload: { drive: { x: -0.92, y: 0 } }, durationMs };
  }
  if (hasAny(t, [/右转/u, /向右/u, /往右/u])) {
    return { type: "control", payload: { drive: { x: 0.92, y: 0 } }, durationMs };
  }
  if (hasAny(t, [/停/u, /停止/u, /刹车/u])) {
    return { type: "control", payload: { drive: { x: 0, y: 0 } } };
  }
  return null;
}

/** True when transcript looks like Q&A / chat / math, not a drive/camera command. */
function isLikelyGeneralKnowledgeQuery(transcript) {
  const s = String(transcript || "").trim();
  if (s.length < 2) return false;
  const roverish =
    /前进|后退|倒车|左(?:转|拐)?|右(?:转|拐)?|停|刹|拍照|抓拍|夜视|关灯|开灯|头灯|云台|激光|安静模式|usb|录像|直行|绕圈|画圈|转圈|米|秒|厘米|漫游车|小车|舵机|复位|抬头|低头/i.test(
      s,
    );
  if (roverish) return false;
  return /what\b|how\s+(?:far|long|many|much|old|big)|why\b|when\b|who\b|which\b|^\s*\d+\s*[\+\-\*×÷\/]\s*\d+|1\s*\+\s*1|plus\b|equals?\b|mars|moon|earth|sun|distance|tell me|calculate|math|\?|？|几加几|一加一|多少|等于几|为什么|什么|怎么|多远|火星|月球|地球|太阳|聊天|笑话|百科|解释/i.test(
    s,
  );
}

function stripFence(text) {
  const s = String(text || "").trim();
  if (!s.startsWith("```")) return s;
  return s.replace(/^```[a-zA-Z]*\s*/u, "").replace(/```$/u, "").trim();
}

function extractFirstJsonObject(text) {
  const s = stripFence(text);
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model response");
  let depth = 0;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error("Unterminated JSON object in model response");
}

function normalizeAction(action, transcript = "") {
  if (!action || action.type === "none") return null;

  if (action.type === "sequence" && Array.isArray(action.actions)) {
    // Do not pass full transcript into child steps — global 左转/右转 would corrupt every segment.
    const normalized = action.actions
      .map((a) => normalizeAction(a, ""))
      .filter(Boolean)
      .slice(0, MAX_SEQUENCE_STEPS);
    if (!normalized.length) return null;
    return { type: "sequence", actions: normalized };
  }

  if (action.type === "usb_power") {
    if (!action.usbPower) return null;
    return { type: "usb_power", action: action.usbPower };
  }

  if (action.type === "camera") {
    const cameraAction = String(action.cameraAction || "").trim();
    if (cameraAction === "capture") return { type: "camera", action: "capture" };
    if (cameraAction === "nightvision_on") {
      return { type: "camera", action: "nightvision", active: true };
    }
    if (cameraAction === "nightvision_off") {
      return { type: "camera", action: "nightvision", active: false };
    }
    if (cameraAction === "focus") {
      const mode = ["near", "normal", "far", "auto"].includes(action.focusMode)
        ? action.focusMode
        : null;
      if (!mode) return null;
      return { type: "camera", action: "focus", mode };
    }
    if (cameraAction === "resolution") {
      const mode = ["240p", "480p", "720p", "1080p", "2K"].includes(action.resolutionMode)
        ? action.resolutionMode
        : null;
      if (!mode) return null;
      return { type: "camera", action: "resolution", mode };
    }
    return null;
  }

  if (action.type === "quiet_mode") {
    if (typeof action.enabled !== "boolean") return null;
    return { type: "quiet_mode", enabled: action.enabled };
  }

  if (action.type === "control") {
    const payload = {};

    if (action.command && ALLOWED_COMMANDS.has(action.command)) {
      payload.command = action.command;
    }
    if (action.drive) {
      payload.drive = {
        x: clamp(action.drive.x, -1, 1),
        y: clamp(action.drive.y, -1, 1),
      };
      const linearCue = hasAny(transcript, [
        /前进/u,
        /往前/u,
        /向前/u,
        /后退/u,
        /往后/u,
        /向后/u,
      ]);
      const turnCue = hasAny(transcript, [
        /左转/u,
        /向左/u,
        /往左/u,
        /右转/u,
        /向右/u,
        /往右/u,
      ]);
      // Phrases like "前进…然后右转" must be a sequence; forcing both axes here creates an unwanted arc.
      if (!(linearCue && turnCue)) {
        if (hasAny(transcript, [/前进/u, /往前/u, /向前/u])) {
          payload.drive.y = -Math.max(Math.abs(payload.drive.y), 0.85);
        } else if (hasAny(transcript, [/后退/u, /往后/u, /向后/u])) {
          payload.drive.y = Math.max(Math.abs(payload.drive.y), 0.85);
        }
        if (hasAny(transcript, [/左转/u, /向左/u, /往左/u])) {
          payload.drive.x = -Math.max(Math.abs(payload.drive.x), 0.8);
        } else if (hasAny(transcript, [/右转/u, /向右/u, /往右/u])) {
          payload.drive.x = Math.max(Math.abs(payload.drive.x), 0.8);
        }
      }
    }
    if (action.gimbal) {
      payload.gimbal = {
        x: clamp(action.gimbal.x, -1, 1),
        y: clamp(action.gimbal.y, -1, 1),
      };
    }

    if (Object.keys(payload).length === 0) return null;

    // Only timed drive operations keep duration.
    let durationMs;
    if (payload.drive && !payload.command) {
      durationMs = clamp(action.durationMs ?? 0, 350, 8_000);
    }

    return durationMs
      ? { type: "control", payload, durationMs }
      : { type: "control", payload };
  }

  return null;
}

function normalizeRawOutput(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Voice model did not return an object");
  }
  const replyText = String(
    raw.replyText ??
      raw.message ??
      raw.answer ??
      raw.response ??
      raw.content ??
      raw.text ??
      raw.reply ??
      "",
  ).trim();
  if (!replyText) throw new Error("Voice model replyText is empty");
  let action = raw.action && typeof raw.action === "object" ? raw.action : null;
  if (!action && raw.type === "none") {
    action = { type: "none" };
  }
  return { replyText, action };
}

export async function interpretVoiceTranscript({
  transcript,
  health = null,
  recentContext = "",
}) {
  if (!config.deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const capabilitySpec = {
    actionTypes: [
      "none",
      "control",
      "sequence",
      "usb_power",
      "camera",
      "quiet_mode",
    ],
    control: {
      command: [...ALLOWED_COMMANDS],
      drive: {
        range: [-1, 1],
        semantics: {
          "y<0": "forward",
          "y>0": "backward",
          "x<0": "turn_left",
          "x>0": "turn_right",
          "x=0,y=0": "stop",
        },
      },
      gimbal: {
        range: [-1, 1],
        semantics: {
          "x>0": "look_right",
          "x<0": "look_left",
          "y<0": "look_up",
          "y>0": "look_down",
          "x=0,y=0": "hold",
        },
      },
      durationMs: { min: 350, max: 8000 },
    },
    camera: {
      cameraAction: [
        "capture",
        "nightvision_on",
        "nightvision_off",
        "focus",
        "resolution",
      ],
      focusMode: ["near", "normal", "far", "auto"],
      resolutionMode: ["240p", "480p", "720p", "1080p", "2K"],
    },
    usb_power: { usbPower: ["on", "off"] },
    quiet_mode: { enabled: [true, false] },
    generalBehavior: [
      "You are also a normal conversational assistant: answer small talk, general knowledge, and school-level math/science in replyText when the user is not asking to move the rover.",
      "Never refuse or scold the user for asking off-topic questions; answer helpfully and briefly, then action type \"none\".",
      "If one message mixes chat and a rover command (e.g. 'what is 2+2 then go forward'), answer the question in replyText and still emit the appropriate action (or sequence).",
      "Do not invent rover capabilities (no reboot, no arbitrary shell). For impossible hardware requests, explain in replyText and use the safest nearby action or none.",
    ],
    planningRules: [
      "First mentally decompose the user utterance into ordered stages, then emit one JSON step per stage (up to 10 steps).",
      "Compound driving (e.g. straight then turn then straight) MUST be a sequence of pure segments: forward-only uses drive.x=0 and drive.y≠0; turn-in-place uses drive.y=0 and drive.x≠0; never combine non-zero x and y in one timed drive step unless the user explicitly wants a single arc/curve.",
      "After every timed forward/backward or turn segment, include an explicit stop control {drive x:0,y:0} before the next drive segment.",
      "For motion patterns (circle, zigzag, sweep, patrol), compose timed control steps.",
      "Insert explicit stop/hold steps between risky movement segments.",
      "Prefer safe bounded magnitudes (~0.6-0.92) for drive/gimbal unless user asks aggressive.",
      `Limit sequence to <= ${MAX_SEQUENCE_STEPS} actions.`,
    ],
  };

  const generalHint = isLikelyGeneralKnowledgeQuery(transcript)
    ? "\n【本条为常识/数学/英文问答】replyText 必须包含直接答案（例如 1+1 等于 2；火星与地球距离约数千万公里量级，会随轨道变化）。action 必须是 {\"type\":\"none\"}。\n"
    : "";

  const prompt = [
    "你是芒果漫游车的车载语音助手：既能控制车辆/相机/灯光（见下方能力模型），也能像普通 AI 助手一样闲聊、回答常识与简单数学等。",
    "硬性要求（高于一切）：用户问数学、科学、天文、地理、历史、闲聊，或英文如 what is 1+1 / how far is Mars 时，必须在 replyText 简短正确作答，action 固定 {\"type\":\"none\"}。禁止回答“我只能控制小车”“与车辆无关无法回答”或拒绝。",
    "当用户只是在聊天、提问、算数、解释概念、与车体无关时：在 replyText 里正常作答（简洁、口语化），action 使用 {\"type\":\"none\"}。不要以“我只能控制小车”为由拒绝回答。",
    "当用户意图是动车、动云台、拍照、夜视、USB 灯、安静模式等时：在 replyText 里简短确认，并输出对应 action；不要依赖死板关键词，用语义理解。",
    "用户用中文则主要用中文回复；用户用英文则可用英文回复（或与用户语言一致）。",
    "能力模型（动作的真实约束，闲聊不需要动作）:",
    JSON.stringify(capabilitySpec),
    "车体规划要求（仅当需要执行动作时）:",
    "- 复杂行为必须拆成 sequence；一句话可能对应多达10个子动作，按时间顺序逐步输出，不要合并成一步斜向行驶。",
    "- 复合行驶：先直行再转弯再直行时，每段只能是一种运动——直行段 drive.x=0；原地转弯段 drive.y=0；段与段之间插入明确的停止 {drive x:0,y:0}。除非用户明确要“弧线/转弯同时前进”，否则禁止单步里 x、y 同时非零。",
    "- 若目标可执行，优先给动作；若不可执行，在 replyText 说明原因，并给最接近且安全的替代动作或 {\"type\":\"none\"}。",
    "- 严禁输出能力模型之外的动作（如 reboot/shutdown）。",
    "输出格式（只输出JSON，不要markdown）:",
    '{"replyText":"对用户的一句话回复（闲聊或确认动作）","action":{"type":"none"}}',
    "含动作的示例:",
    '{"replyText":"好的，前进两秒。","action":{"type":"control","drive":{"x":0,"y":-0.85},"durationMs":2000}}',
    `当前状态(可选参考): ${JSON.stringify(health || {})}`,
    recentContext ? `最近上下文: ${recentContext}` : "",
    generalHint,
    `用户文本: ${transcript}`,
  ]
    .filter(Boolean)
    .join("\n");

  const url = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await axios.post(
    url,
    {
      model: config.deepseek.model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a general-purpose AI assistant embedded in a rover. You MUST answer math, science, trivia, and English questions (e.g. 1+1, distance to Mars) in replyText with action {\"type\":\"none\"}. There is no refusal for 'unrelated' topics. When the user asks to move the rover or use camera/lights, set the appropriate action. Always output exactly one JSON object: {\"replyText\":\"...\",\"action\":{...}}. Never say you only help with the car.",
        },
        { role: "user", content: prompt },
      ],
    },
    {
      timeout: config.deepseek.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  const text = response?.data?.choices?.[0]?.message?.content ?? "";
  const jsonText = extractFirstJsonObject(text);
  const parsed = normalizeRawOutput(JSON.parse(jsonText));
  const action = normalizeAction(parsed.action, transcript);
  return {
    replyText: parsed.replyText,
    action,
  };
}

