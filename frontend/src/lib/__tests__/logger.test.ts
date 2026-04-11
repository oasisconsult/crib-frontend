import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, log } from "../logger";

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("in development mode", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("logs debug messages to console.debug", () => {
      const context = { userId: "123", component: "TestComponent" };
      
      logger.debug("Test debug message", context);

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining("DEBUG: Test debug message"),
        expect.stringContaining('"userId":"123"')
      );
    });

    it("logs info messages to console.info", () => {
      logger.info("Test info message");

      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: Test info message"),
        ""
      );
    });

    it("logs warning messages to console.warn", () => {
      logger.warn("Test warning message");

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("WARN: Test warning message"),
        ""
      );
    });

    it("logs error messages to console.error", () => {
      const error = new Error("Test error");
      const context = { component: "TestComponent" };
      
      logger.error("Test error message", error, context);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("ERROR: Test error message"),
        error
      );
    });

    it("includes timestamp in log messages", () => {
      logger.info("Test message");

      const consoleCall = (console.info as any).mock.calls[0][0];
      expect(consoleCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe("in production mode", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("does not log to console in production", () => {
      logger.info("Test message");
      logger.debug("Debug message");
      logger.warn("Warning message");
      logger.error("Error message");

      expect(console.info).not.toHaveBeenCalled();
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("in test mode", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "test");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("does not log anything in test mode", () => {
      logger.info("Test message");
      logger.debug("Debug message");
      logger.warn("Warning message");
      logger.error("Error message");

      expect(console.info).not.toHaveBeenCalled();
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("specialized logging methods", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("logs auth events with proper context", () => {
      logger.auth("login", "user123", { ip: "192.168.1.1" });

      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: Auth: login"),
        expect.stringContaining('"userId":"user123"')
      );
    });

    it("logs API calls with proper context", () => {
      logger.api("GET", "/api/users", 200, { duration: 150 });

      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: API: GET /api/users (200)"),
        expect.stringContaining('"status":200')
      );
    });

    it("logs API errors with error level", () => {
      logger.api("POST", "/api/users", 400, { validation: "failed" });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("ERROR: API: POST /api/users (400)"),
        expect.stringContaining('"status":400')
      );
    });

    it("logs performance metrics", () => {
      logger.performance("database_query", 250, { query: "SELECT * FROM users" });

      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: Performance: database_query took 250ms"),
        expect.stringContaining('"duration":250')
      );
    });

    it("logs user actions", () => {
      logger.user("clicked_button", "user123", { button: "submit" });

      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: User: clicked_button"),
        expect.stringContaining('"userId":"user123"')
      );
    });
  });

  describe("performance measurement", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    it("measures synchronous function performance", () => {
      const testFn = () => {
        vi.advanceTimersByTime(100);
        return "result";
      };

      const result = logger.measure("test_operation", testFn);

      expect(result).toBe("result");
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: Performance: test_operation took 100ms"),
        expect.objectContaining({ duration: 100 })
      );
    });

    it("measures async function performance", async () => {
      const testFn = async () => {
        vi.advanceTimersByTime(200);
        return "async_result";
      };

      const result = await logger.measureAsync("async_operation", testFn);

      expect(result).toBe("async_result");
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("INFO: Performance: async_operation took 200ms"),
        expect.objectContaining({ duration: 200 })
      );
    });

    it("logs errors when measurement fails", () => {
      const error = new Error("Test error");
      const testFn = () => {
        vi.advanceTimersByTime(50);
        throw error;
      };

      expect(() => logger.measure("failing_operation", testFn)).toThrow("Test error");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("ERROR: Performance: failing_operation failed after 50ms"),
        error,
        expect.objectContaining({ duration: 50 })
      );
    });
  });
});

describe("log convenience exports", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("provides convenience functions that delegate to logger", () => {
    log.info("Test message");

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("INFO: Test message"),
      ""
    );
  });

  it("provides measure convenience function", () => {
    const testFn = () => "test_result";
    vi.useFakeTimers();

    const result = log.measure("test", testFn);

    expect(result).toBe("test_result");
    vi.useRealTimers();
  });
});
