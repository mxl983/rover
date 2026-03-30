import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.NODE_ENV = "test";
process.env.SSL_ENABLED = "false";
process.env.TELEMETRY_ENABLED = "true";

const dir = mkdtempSync(join(tmpdir(), "rover-srv-test-"));
process.env.TELEMETRY_DB_PATH = join(dir, "telemetry.db");
mkdirSync(dir, { recursive: true });

process.on("exit", () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
