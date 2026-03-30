import mqtt from "mqtt";
import config from "../config.js";

const mqttOptions = {
  port: config.mqtt.port,
  host: config.mqtt.host,
  protocol: config.mqtt.protocol,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  keepalive: 60,
  reconnectPeriod: 1000,
  rejectUnauthorized: config.mqtt.rejectUnauthorized,
};

export class MqttService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryCount = 0;
  }

  /**
   * Initialize the connection to HiveMQ Cloud.
   * This should be called once in your main server.js entry point.
   */
  connect(options = mqttOptions) {
    if (this.client) {
      console.warn("⚠️ MQTT client already exists. Skipping initialization.");
      return;
    }

    console.log("📡 Connecting to HiveMQ Cloud...");
    this.client = mqtt.connect(options);

    // --- EVENT HANDLERS ---

    this.client.on("connect", () => {
      this.isConnected = true;
      this.retryCount = 0;
      console.log("✅ MQTT Service: Connected to Broker");

      // Subscribe to any necessary topics (e.g., remote wake-up)
      this.client.subscribe("rover/commands/#", (err) => {
        if (!err) console.log("📥 Subscribed to rover/commands/#");
      });
    });

    this.client.on("reconnect", () => {
      this.retryCount++;
      console.log(
        `🔄 MQTT Service: Attempting to reconnect (${this.retryCount})...`,
      );
    });

    this.client.on("error", (err) => {
      console.error("❌ MQTT Service Error:", err.message);
      this.isConnected = false;
    });

    this.client.on("close", () => {
      this.isConnected = false;
      console.log("🔌 MQTT Service: Connection closed");
    });
  }

  /**
   * Generic Publish Method
   */
  publish(topic, payload, qos = 1) {
    if (!this.isConnected) {
      console.error(`🚨 MQTT Not Connected: Failed to publish to ${topic}`);
      return;
    }

    // Convert objects to strings automatically
    const message =
      typeof payload === "object" ? JSON.stringify(payload) : String(payload);

    this.client.publish(topic, message, { qos }, (err) => {
      if (err) console.error(`❌ Publish failed to ${topic}:`, err);
    });
  }

  /**
   * Helper: Send log messages to the cloud
   */
  log(message) {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [PI]: ${message}`;
    console.log(`LOG: ${message}`); // Log to local console too
    this.publish("rover/logs", formattedMsg);
  }

  /**
   * Helper: Execute Idle Shutdown Sequence
   */
  triggerIdleShutdown(stats) {
    this.log("⚠️ IDLE SHUTDOWN TRIGGERED");

    // Send telemetry context so you know why it happened
    this.publish("rover/logs/debug", {
      reason: "idle_timeout",
      last_ping: stats.lastPing,
      uptime: stats.uptime,
    });

    // Send the power-cut commands
    this.publish("rover/power/pi", "Off 15000");
    this.publish("rover/power/aux", "Off");

    this.log("📡 Power-off commands broadcasted to ESP32.");
  }

  /**
   * Helper: Toggle USB Power via uhubctl
   */
  publishUsbState(state) {
    this.publish("rover/status/usb", state ? "ON" : "OFF");
  }
}

// Export the singleton instance
export const mqttService = new MqttService();
