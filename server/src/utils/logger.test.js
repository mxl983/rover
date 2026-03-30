import { describe, it, expect } from "vitest";
import { logger } from "./logger.js";

describe("logger", () => {
  it("exports pino logger with expected methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });
});
