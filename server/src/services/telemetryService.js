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
  `);
  return db;
}

function cleanup() {
  if (!db || !config.telemetry.retentionDays) return;
  try {
    const cutoff = new Date(Date.now() - config.telemetry.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM telemetry WHERE created_at < ?").run(cutoff);
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

export function recordTelemetry(health) {
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
      INSERT INTO telemetry (voltage, battery_pct, distance, pan, tilt, cpu_temp, cpu_load, wifi_signal, usb_power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
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
