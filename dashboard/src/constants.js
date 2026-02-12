export const PI_SERVER_IP = "rover.tail9d0237.ts.net";

export const AUDIO_STREAM_HOST = `https://${PI_SERVER_IP}:8889/mic/whep`;
export const VIDEO_STREAM_HOST = `https://${PI_SERVER_IP}:8889/cam/whep`;

export const PI_CONTROL_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/control/drive`;
export const PI_SYSTEM_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/system`;
export const PI_CAMERA_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/camera`;
export const PI_WEBSOCKET = `wss://${PI_SERVER_IP}:3000`;

export const PI_HI_RES_CAPTURE_ENDPOINT = `https://${PI_SERVER_IP}:3000/api/camera/capture`;

export const MQTT_HOST =
  "wss://84f09906a62e42c78c5d9b0555aa71f1.s1.eu.hivemq.cloud:8884/mqtt";
