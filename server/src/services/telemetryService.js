import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import config from "../config.js";

let db = null;

function getDb() {
  if (db) return db;
  const dir = path.dirname(config.telemetry.dbPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  db = new Database(config.telemetry.dbPath, {
    verbose: config.env === "development" ? console.log : null,
  });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      event TEXT,
      voltage REAL,
      battery_pct REAL,
      distance REAL,
      pan REAL,
      tilt REAL,
      cpu_temp TEXT,
      cpu_load INTEGER,
      wifi_signal INTEGER,
      usb_power INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry(created_at);
    CREATE TABLE IF NOT EXISTS client_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      event TEXT NOT NULL,
      client_ip TEXT,
      user_agent TEXT,
      device_info TEXT,
      location_info TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_client_connections_created_at ON client_connections(created_at);
  `);
  // Lightweight migration for existing DBs created before telemetry.event existed.
  try {
    const cols = db.prepare("PRAGMA table_info(telemetry)").all();
    const hasEvent = cols.some((c) => c.name === "event");
    if (!hasEvent) {
      db.exec("ALTER TABLE telemetry ADD COLUMN event TEXT");
    }
  } catch (e) {
    console.warn("Telemetry schema migration check failed:", e.message);
  }
  return db;
}

function cleanup() {
  if (!db) return;
  const days = config.telemetry.retentionDays;
  if (!days || days <= 0) return;
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const t = db.prepare("DELETE FROM telemetry WHERE created_at < ?").run(cutoff);
    const c = db.prepare("DELETE FROM client_connections WHERE created_at < ?").run(cutoff);
    if (t.changes + c.changes > 0) {
      console.log(`Telemetry retention: removed ${t.changes} telemetry rows, ${c.changes} client_connection rows older than ${days} days`);
    }
  } catch (e) {
    console.warn("Telemetry cleanup failed:", e.message);
  }
}

let cleanupInterval = null;

export function initTelemetry() {
  if (!config.telemetry.enabled) return;
  try {
    getDb();
    cleanup();
    cleanupInterval = setInterval(cleanup, 60 * 60 * 1000);
  } catch (e) {
    console.warn("Telemetry init failed:", e.message);
  }
}

export function recordTelemetry(health, event = "health_report") {
  if (!config.telemetry.enabled || !health) return;
  if (!db) {
    try {
      getDb();
    } catch (e) {
      return;
    }
  }
  try {
    const stmt = db.prepare(`
      INSERT INTO telemetry (event, voltage, battery_pct, distance, pan, tilt, cpu_temp, cpu_load, wifi_signal, usb_power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event || "health_report",
      health.voltage ?? null,
      health.battery != null ? parseFloat(health.battery) : null,
      health.distance ?? null,
      health.pan ?? null,
      health.tilt ?? null,
      health.cpuTemp ?? null,
      health.cpuLoad ?? null,
      health.wifiSignal ?? null,
      health.usbPower === "on" ? 1 : 0,
    );
  } catch (e) {
    console.warn("Telemetry record failed:", e.message);
  }
}

export function getTelemetry(options = {}) {
  const { limit = 100, since } = options;
  if (!config.telemetry.enabled || !db) return [];
  try {
    if (since) {
      return db.prepare("SELECT * FROM telemetry WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?").all(since, limit);
    }
    return db.prepare("SELECT * FROM telemetry ORDER BY created_at DESC LIMIT ?").all(limit);
  } catch (e) {
    console.warn("Telemetry query failed:", e.message);
    return [];
  }
}

export function recordClientConnection(payload) {
  if (!config.telemetry.enabled) return;
  if (!db) {
    try {
      getDb();
    } catch (e) {
      return;
    }
  }
  try {
    const stmt = db.prepare(`
      INSERT INTO client_connections (event, client_ip, user_agent, device_info, location_info)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      payload.event ?? "connect",
      payload.clientIp ?? null,
      payload.userAgent ?? null,
      payload.deviceInfo != null ? JSON.stringify(payload.deviceInfo) : null,
      payload.locationInfo != null ? JSON.stringify(payload.locationInfo) : null,
    );
  } catch (e) {
    console.warn("Client connection record failed:", e.message);
  }
}

export function closeTelemetry() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}
