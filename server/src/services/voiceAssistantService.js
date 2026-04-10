import axios from "axios";
import config from "../config.js";
import { logger } from "../utils/logger.js";

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

function maxTimedDriveMs() {
  return config.voiceDrive.maxTimedDriveMs;
}

function linearSpeedMps() {
  return config.voiceDrive.estimatedLinearSpeedMps;
}

function turnDegPerSec() {
  return config.voiceDrive.estimatedTurnDegPerSec;
}

function parseSeconds(text) {
  const m = String(text || "").match(/([零一二两三四五六七八九十\d.]+)\s*秒/u);
  if (!m) return null;
  const n = parseCnNumber(m[1]);
  if (n == null || !Number.isFinite(n)) return null;
  return clamp(n * 1000, 350, maxTimedDriveMs());
}

/** Parse distance in meters from 米/厘米 or simple English (m/cm). */
function parseDistanceMeters(text) {
  const t = String(text || "");
  let m = t.match(/([零一二两三四五六七八九十\d.]+)\s*厘米/u);
  if (m) {
    const n = parseCnNumber(m[1]);
    if (n != null && Number.isFinite(n)) return n / 100;
  }
  m = t.match(/(\d+\.?\d*)\s*厘米/u);
  if (m) return Number(m[1]) / 100;
  m = t.match(/([零一二两三四五六七八九十\d.]+)\s*米/u);
  if (m) {
    const n = parseCnNumber(m[1]);
    if (n != null && Number.isFinite(n)) return n;
  }
  m = t.match(/(\d+\.?\d*)\s*米/u);
  if (m) return Number(m[1]);
  m = t.match(/(\d+\.?\d*)\s*(?:m|meter|meters)\b/i);
  if (m) return Number(m[1]);
  m = t.match(/(\d+\.?\d*)\s*(?:cm|centimeter)\b/i);
  if (m) return Number(m[1]) / 100;
  return null;
}

/** Count 米 / 厘米 distance phrases (excluding 厘米’s inner 米). Used to avoid applying one parsed distance to every segment of a compound command. */
function countDistanceMentions(text) {
  const t = String(text || "");
  const cmMatches = t.match(/\d+\.?\d*\s*厘米|([零一二两三四五六七八九十]+)\s*厘米/gu);
  const cmCount = cmMatches ? cmMatches.length : 0;
  const stripped = t
    .replace(/\d+\.?\d*\s*厘米/g, "")
    .replace(/([零一二两三四五六七八九十]+)\s*厘米/g, "");
  const mMatches = stripped.match(
    /([零一二两三四五六七八九十\d.]|\d+\.?\d*)\s*米/gu,
  );
  const mCount = mMatches ? mMatches.length : 0;
  return cmCount + mCount;
}

function hasMultipleDistanceMentions(text) {
  return countDistanceMentions(text) >= 2;
}

function hasExplicitSecondsCue(text) {
  return parseSeconds(text) != null;
}

function isPrimarilyLinearForward(drive) {
  if (!drive) return false;
  return Math.abs(drive.y) >= Math.abs(drive.x) && drive.y < -0.1;
}

function isPrimarilyLinearBackward(drive) {
  if (!drive) return false;
  return Math.abs(drive.y) >= Math.abs(drive.x) && drive.y > 0.1;
}

/** Tank turn: dominant x, y ~ 0 (same as joystick in-place rotation). */
function isPrimarilyTurnInPlace(drive) {
  if (!drive) return false;
  return Math.abs(drive.x) > 0.1 && Math.abs(drive.x) >= Math.abs(drive.y);
}

/** Parse heading change in degrees from 度 / English deg. */
function parseAngleDegrees(text) {
  const t = String(text || "");
  if (/九十/u.test(t) && /度/u.test(t)) return 90;
  let m = t.match(/(\d+\.?\d*)\s*度/u);
  if (m) return clamp(Number(m[1]), 1, 360);
  m = t.match(/(\d+\.?\d*)\s*(?:deg|degree|degrees)\b/i);
  if (m) return clamp(Number(m[1]), 1, 360);
  return null;
}

function turnDirectionFromTranscript(tf, payload) {
  const left = hasAny(tf, [/左转/u, /向左/u, /往左/u, /\bturn\s+left\b/i]);
  const right = hasAny(tf, [/右转/u, /向右/u, /往右/u, /\bturn\s+right\b/i]);
  if (right && !left) return "right";
  if (left && !right) return "left";
  const x = payload.drive?.x ?? 0;
  if (x > 0.1) return "right";
  if (x < -0.1) return "left";
  return null;
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

/** One gimbal hold step for normalizeAction (expects top-level gimbal + durationMs). */
function gimbalTimedStep(x, y, durationMs = 450) {
  return {
    type: "control",
    gimbal: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) },
    durationMs,
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
  if (!hasAny(t, [/点头/u, /上下点/u, /上下看/u, /镜头点头/u, /\bnod(\s+head)?\b/i])) return null;
  const repeat = parseRepeatCount(t) ?? 2;
  const actions = [];
  actions.push(gimbalTimedStep(0, 0, 500)); // reset to center before gesture
  for (let i = 0; i < repeat; i += 1) {
    actions.push(gimbalTimedStep(0, -0.8, 650)); // look up (slower, more reliable)
    actions.push(gimbalTimedStep(0, 0.8, 650)); // look down (slower, more reliable)
  }
  actions.push(gimbalTimedStep(0, 0, 500)); // settle at center after nod
  return { type: "sequence", actions: actions.slice(0, MAX_SEQUENCE_STEPS) };
}

/** Side-to-side “shake head” — pan camera left/right using gimbal x. */
function parseShakeCamera(text) {
  const t = String(text || "");
  if (
    !hasAny(t, [
      /摇头/u,
      /左右摇/u,
      /左右摆/u,
      /镜头左右/u,
      /\bshake\s*(?:your\s+)?head\b/i,
    ])
  ) {
    return null;
  }
  const repeat = parseRepeatCount(t) ?? 2;
  const actions = [];
  actions.push(gimbalTimedStep(0, 0, 500)); // reset to center before gesture
  for (let i = 0; i < repeat; i += 1) {
    actions.push(gimbalTimedStep(-0.75, 0, 650)); // look left (slower)
    actions.push(gimbalTimedStep(0.75, 0, 650)); // look right (slower)
  }
  actions.push(gimbalTimedStep(0, 0, 500)); // settle at center after shake
  return { type: "sequence", actions: actions.slice(0, MAX_SEQUENCE_STEPS) };
}

/**
 * Pure “点点头 / 摇摇头” (no question) — skip LLM and run gesture.
 * Questions must still go through the model for replyText + optional gesture.
 */
function tryHeadGestureShortcut(transcript) {
  const t = String(transcript || "").trim();
  if (!t || t.length > 28) return null;
  if (/[?？]/.test(t)) return null;
  if (/\b(吗|嘛)\s*$/u.test(t)) return null;
  const nod = parseNodCamera(t);
  if (nod) return { replyText: "好的。", action: nod };
  const shake = parseShakeCamera(t);
  if (shake) return { replyText: "好的。", action: shake };
  return null;
}

/** Yes/no about rover/telemetry — may pair answer with nod (yes) or shake (no). */
function isYesNoRoverStateQuestion(transcript) {
  const s = String(transcript || "").trim();
  const roverTopic =
    /电量|电池|充电|电压|wifi|wlan|网络|连接|在线|温度|CPU|内存|姿态|健康|health|battery|charging|voltage|connect|connection|online|telemetry|signal|低于|高于|percent|百分之|%/i.test(
      s,
    );
  const looksYesNo =
    /[?？]|吗\s*$|是不是|有没有|对不对|是否|能不能|可不可以|lower\s+than|higher\s+than|below|above|\b(is|are|does|do|can|will|has|have)\s+/i.test(
      s,
    );
  return roverTopic && looksYesNo;
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

function normalizeAction(action, transcript = "", transcriptForDuration = transcript) {
  if (!action || action.type === "none") return null;

  if (action.type === "sequence") {
    const rawList = Array.isArray(action.actions)
      ? action.actions
      : Array.isArray(action.steps)
        ? action.steps
        : null;
    if (!rawList) return null;
    // Axis cues: empty transcript so 左转/右转 in one utterance does not corrupt every segment.
    // Distance / 秒: pass transcriptForDuration so “前进一米” still maps to timed duration per step.
    const normalized = rawList
      .map((a) => normalizeAction(a, "", transcriptForDuration))
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

    // ~90° in-place: use motor quick_turn (~2.43s, tuned in RoverDriver), not timed analog.
    if (
      payload.drive &&
      !payload.command &&
      isPrimarilyTurnInPlace(payload.drive)
    ) {
      const tf = transcriptForDuration;
      const deg = parseAngleDegrees(tf);
      const dir = turnDirectionFromTranscript(tf, payload);
      if (deg != null && Math.abs(deg - 90) < 0.5 && dir) {
        return {
          type: "control",
          payload: {
            command:
              dir === "right" ? "turn_right_90_slow" : "turn_left_90_slow",
          },
        };
      }
    }

    let durationMs;
    if (payload.drive && !payload.command) {
      const maxMs = maxTimedDriveMs();
      const tf = transcriptForDuration;
      if (hasExplicitSecondsCue(tf)) {
        durationMs = clamp(parseSeconds(tf), 350, maxMs);
      } else {
        const dMeters = parseDistanceMeters(tf);
        let fromDistance = false;
        // Compound utterances ("前进一米然后…前进20厘米") share one transcript; a single
        // parseDistanceMeters() would pick one match (often the wrong segment) — trust LLM durations.
        if (
          dMeters != null &&
          dMeters > 0 &&
          linearSpeedMps() > 0 &&
          !hasMultipleDistanceMentions(tf)
        ) {
          const fwd = isPrimarilyLinearForward(payload.drive);
          const back = isPrimarilyLinearBackward(payload.drive);
          const fwdCue = hasAny(tf, [/前进/u, /往前/u, /向前/u]);
          const backCue = hasAny(tf, [/后退/u, /往后/u, /向后/u]);
          if (fwd && fwdCue && !backCue) {
            durationMs = clamp(
              Math.round((dMeters / linearSpeedMps()) * 1000),
              350,
              maxMs,
            );
            fromDistance = true;
          } else if (back && backCue && !fwdCue) {
            durationMs = clamp(
              Math.round((dMeters / linearSpeedMps()) * 1000),
              350,
              maxMs,
            );
            fromDistance = true;
          }
        }
        if (!fromDistance) {
          let fromTurnAngle = false;
          if (
            isPrimarilyTurnInPlace(payload.drive) &&
            turnDegPerSec() > 0
          ) {
            const ang = parseAngleDegrees(tf);
            if (ang != null && ang > 0 && Math.abs(ang - 90) >= 0.5) {
              durationMs = clamp(
                Math.round((ang / turnDegPerSec()) * 1000),
                350,
                maxMs,
              );
              fromTurnAngle = true;
            }
          }
          if (!fromTurnAngle) {
            durationMs = clamp(action.durationMs ?? 0, 350, maxMs);
          }
        }
      }
    }

    if (
      payload.gimbal &&
      !payload.command &&
      !payload.drive &&
      action.durationMs != null
    ) {
      durationMs = clamp(action.durationMs, 50, maxTimedDriveMs());
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

  const headShortcut = tryHeadGestureShortcut(transcript);
  if (headShortcut) {
    const action = normalizeAction(headShortcut.action, transcript);
    return { replyText: headShortcut.replyText, action };
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
      durationMs: { min: 350, max: maxTimedDriveMs() },
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
    quiet_mode: {
      enabled: [true, false],
      semantics:
        "enabled true = quiet drive (default): slow steady motors; enabled false = boost drive (faster). Does not affect speaker or TTS.",
    },
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
      `Limit sequence to <= ${MAX_SEQUENCE_STEPS} entries in the "actions" array (synonym: "steps").`,
      `Linear distance (米/厘米, not 秒): approximate floor speed ≈ ${linearSpeedMps()} m/s at typical drive.y; durationMs ≈ round(1000 * meters / ${linearSpeedMps()}), max ${maxTimedDriveMs()} ms. The server recalculates from transcript when possible for a single distance only; compound phrases with multiple distances (e.g. 前进一米然后…前进20厘米) must use per-step durationMs in your sequence — the server will not override those.`,
      "In-place 90° (左转/右转 + 90度/九十度): the server uses command turn_left_90_slow or turn_right_90_slow (motor-calibrated). For other angles (度), timed drive.x duration is scaled by estimated turn rate; you may still emit drive + durationMs.",
      "Head nod (点头 / nod): sequence of timed gimbal steps, alternate y negative then positive (~±0.85), durationMs 400–550 per step. Head shake (摇头 / shake head): alternate gimbal x negative then positive (~±0.78), same timing. Start and end each nod/shake sequence with gimbal {x:0,y:0} holds (~200ms) so the camera returns to center before and after the gesture.",
      "Yes/no about rover state (battery, charging, connection, health JSON): in replyText answer clearly; append a nod sequence for an affirmative answer and a shake sequence for a negative answer (do not use action none-only for those).",
    ],
  };

  const generalHint =
    isLikelyGeneralKnowledgeQuery(transcript) &&
    !isYesNoRoverStateQuestion(transcript)
      ? "\n【本条为常识/数学/英文问答】replyText 必须包含直接答案（例如 1+1 等于 2；火星与地球距离约数千万公里量级，会随轨道变化）。action 必须是 {\"type\":\"none\"}。\n"
      : "";

  const yesNoGestureHint = isYesNoRoverStateQuestion(transcript)
    ? "\n【本条为是/否类问题（车体状态、电量、网络连接等），必须结合上方「当前状态」JSON 判断】replyText 简短明确回答。若结论为肯定（是、对、有、低于、异常等），action 用 sequence 做 2～3 次点头（gimbal y 上下交替，每步 durationMs 约 420～520）。若结论为否定（否、没有、不低于、正常、没问题等），action 用 sequence 做 2～3 次摇头（gimbal x 左右交替，每步 durationMs 约 420～520）。最后一步 gimbal 回中。禁止仅输出 {\"type\":\"none\"}。\n"
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
    yesNoGestureHint,
    generalHint,
    `用户文本: ${transcript}`,
  ]
    .filter(Boolean)
    .join("\n");

  const url = `${config.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const requestBody = {
    model: config.deepseek.model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are a general-purpose AI assistant embedded in a rover. You MUST answer math, science, trivia, and English questions (e.g. 1+1, distance to Mars) in replyText with action {\"type\":\"none\"} unless the user prompt explicitly asks for a rover gesture. For yes/no questions about rover health (battery, charging, WiFi, connection) when the prompt includes current state JSON, answer in replyText and add a gimbal sequence: vertical nod (alternate gimbal y) for yes/affirmative, horizontal shake (alternate gimbal x) for no/negative. When the user asks to move the rover or use camera/lights, set the appropriate action. Always output exactly one JSON object: {\"replyText\":\"...\",\"action\":{...}}. Never say you only help with the car.",
      },
      { role: "user", content: prompt },
    ],
  };

  if (config.voiceLlmDebug) {
    logger.info({ url, requestBody }, "voice_llm_outbound_request_full");
  } else {
    logger.info(
      {
        url,
        model: requestBody.model,
        temperature: requestBody.temperature,
        transcript,
        recentContextLen: recentContext.length,
        userPromptChars: prompt.length,
      },
      "voice_llm_outbound_request",
    );
  }

  const response = await axios.post(url, requestBody, {
    timeout: config.deepseek.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.deepseek.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = response?.data?.choices?.[0]?.message?.content ?? "";
  if (config.voiceLlmDebug) {
    logger.info(
      { status: response.status, responseData: response.data },
      "voice_llm_raw_http_response",
    );
  }

  const jsonText = extractFirstJsonObject(text);
  const parsed = normalizeRawOutput(JSON.parse(jsonText));
  const action = normalizeAction(parsed.action, transcript);

  logger.info(
    {
      transcript,
      model: requestBody.model,
      rawModelContent: text.length > 8000 ? `${text.slice(0, 8000)}…(truncated)` : text,
      parsedReplyText: parsed.replyText,
      parsedActionBeforeNormalize: parsed.action,
      normalizedAction: action,
    },
    "voice_llm_result",
  );

  return {
    replyText: parsed.replyText,
    action,
  };
}

