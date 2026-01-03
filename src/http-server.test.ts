import { afterEach, describe, expect, it } from "vitest";
import { _clearTransports, _getTransports } from "./http-server.js";

describe("http-server", () => {
  afterEach(() => {
    _clearTransports();
  });

  describe("transport management", () => {
    it("starts with empty transports map", () => {
      expect(_getTransports().size).toBe(0);
    });

    it("_clearTransports clears all transports", () => {
      const transports = _getTransports();
      // Simulate adding a transport (in real code this happens via the handlers)
      transports.set("test-session-1", {} as never);
      transports.set("test-session-2", {} as never);
      expect(transports.size).toBe(2);

      _clearTransports();
      expect(transports.size).toBe(0);
    });

    it("transports map is shared across calls", () => {
      const transports1 = _getTransports();
      const transports2 = _getTransports();
      expect(transports1).toBe(transports2);
    });
  });
});
