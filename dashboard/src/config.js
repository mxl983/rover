/**
 * Central config derived from environment.
 * Vite exposes only VITE_* variables to the client; use .env / .env.local for overrides.
 */
const PI_SERVER_IP =
  import.meta.env.VITE_PI_SERVER_IP ?? "rover.tail9d0237.ts.net";
const MQTT_HOST =
  import.meta.env.VITE_MQTT_HOST ??
  "wss://84f09906a62e42c78c5d9b0555aa71f1.s1.eu.hivemq.cloud:8884/mqtt";

/** Camera API secret – optional; if unset, camera endpoints may reject or use server-side default. */
export const CAMERA_SECRET = import.meta.env.VITE_CAMERA_SECRET ?? "";

export { PI_SERVER_IP, MQTT_HOST };

export const AUDIO_STREAM_HOST = `https://${PI_SERVER_IP}:8889/mic/whep`;
export const VIDEO_STREAM_HOST = `https://${PI_SERVER_IP}:8889/cam/whep`;
export const AUDIO_TALK_HOST = `https://${PI_SERVER_IP}:8889/talk/whip`;

export const PI_CONTROL_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/control/drive`;
export const PI_DOCKING_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/control/docking`;
export const PI_SYSTEM_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/system`;
export const PI_CAMERA_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/camera`;
export const PI_WEBSOCKET = `wss://${PI_SERVER_IP}:3000`;

export const PI_HI_RES_CAPTURE_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/camera/capture`;

/** Allowed origin for capture URL (same host as API). Used to validate redirects. */
export function getAllowedCaptureOrigin() {
  try {
    return new URL(PI_CONTROL_ENDPOINT).origin;
  } catch {
    return "";
  }
}
