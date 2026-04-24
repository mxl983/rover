import config from "../config.js";
const TELEMETRY_RETRY_LOG_COOLDOWN_MS = 30_000;
let lastRelayErrorTs = 0;

function relayBaseUrl() {
  return (config.telemetry.relayUrl || "").replace(/\/+$/, "");
}

function relayHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (config.telemetry.relayToken) {
    headers.Authorization = `Bearer ${config.telemetry.relayToken}`;
  }
  return headers;
}

function warnRelayError(message, err) {
  const now = Date.now();
  if (now - lastRelayErrorTs < TELEMETRY_RETRY_LOG_COOLDOWN_MS) return;
  lastRelayErrorTs = now;
  const details = err instanceof Error ? err.message : String(err);
  console.warn(`${message}: ${details}`);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.telemetry.relayTimeoutMs,
  );
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function postToRelay(path, body) {
  if (!config.telemetry.enabled) return;
  const base = relayBaseUrl();
  if (!base) return;
  try {
    await fetchJson(`${base}${path}`, {
      method: "POST",
      headers: relayHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    warnRelayError(`Telemetry relay POST failed (${path})`, err);
  }
}

export function initTelemetry() {
  // Local SQLite telemetry is intentionally disabled; relay handles persistence.
}

export function recordTelemetry(health, event = "health_report") {
  if (!config.telemetry.enabled || !health) return;
  void postToRelay("/api/telemetry/ingest", {
    health,
    event: event || "health_report",
  });
}

export function recordRoverHeartbeat(payload = {}) {
  if (!config.telemetry.enabled) return;
  const phase = payload.phase === "booting" ? "booting" : "ready";
  const heartbeat = {
    phase,
    health: payload.health ?? {},
  };
  if (payload.bootStartedAt) {
    heartbeat.bootStartedAt = payload.bootStartedAt;
  }
  void postToRelay("/api/rover/heartbeat", heartbeat);
}

export async function getTelemetry(options = {}) {
  const { limit = 100, since } = options;
  if (!config.telemetry.enabled) return [];
  const base = relayBaseUrl();
  if (!base) return [];
  const qs = new URLSearchParams({ limit: String(limit) });
  if (since) qs.set("since", String(since));
  try {
    const data = await fetchJson(`${base}/api/telemetry?${qs.toString()}`, {
      method: "GET",
      headers: relayHeaders(),
    });
    return Array.isArray(data?.telemetry) ? data.telemetry : [];
  } catch (err) {
    warnRelayError("Telemetry relay query failed", err);
    return [];
  }
}

export function recordClientConnection(payload) {
  if (!config.telemetry.enabled) return;
  void postToRelay("/api/telemetry/client-connection", payload ?? {});
}

export function closeTelemetry() {
  // No local telemetry resources to release.
}
