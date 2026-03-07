import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import { MQTT_HOST } from "../config";

const HEARTBEAT_TOPIC = "rover/esp/heartbeat";

/**
 * Connects to MQTT when sessionCreds is set. Subscribes to ESP heartbeat and exposes client ref.
 * @param {{ username: string; password: string } | null} sessionCreds
 * @returns {{ isEspOnline: boolean; mqttClientRef: React.MutableRefObject<mqtt.MqttClient | null> }}
 */
export function useMqtt(sessionCreds) {
  const [isEspOnline, setIsEspOnline] = useState(false);
  const mqttClientRef = useRef(null);

  useEffect(() => {
    if (!sessionCreds) return;

    const client = mqtt.connect(MQTT_HOST, {
      username: sessionCreds.username,
      password: sessionCreds.password,
      clientId: `heartbeat_web_${Math.random().toString(16).slice(2, 8)}`,
    });

    mqttClientRef.current = client;

    client.subscribe(HEARTBEAT_TOPIC, (err) => {
      if (err) return;
    });

    client.on("message", (topic) => {
      if (topic === HEARTBEAT_TOPIC) setIsEspOnline(true);
    });

    return () => {
      client.end();
    };
  }, [sessionCreds]);

  return { isEspOnline, mqttClientRef };
}
