import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, rateLimitScale } from "../ratelimit";

const req = (ip: string) => new Request("http://x/api", { headers: { "x-forwarded-for": ip } });
const hits = (scope: string, ip: string, n: number) => {
  let rejected = 0;
  for (let i = 0; i < n; i++) {
    try {
      rateLimit(req(ip), scope, 20);
    } catch {
      rejected += 1;
    }
  }
  return rejected;
};

describe("rateLimit · QUORUM_RATELIMIT_SCALE (sala con IP compartida)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sin escala: 20/min por IP → 60 teléfonos en el mismo wifi, 40 reciben 429", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    expect(rateLimitScale()).toBe(1);
    expect(hits("test:scale1", "198.51.100.1", 60)).toBe(40);
  });

  it("con escala 5: el tope pasa a 100/min y entran los 60", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    vi.stubEnv("QUORUM_RATELIMIT_SCALE", "5");
    expect(hits("test:scale5", "198.51.100.2", 60)).toBe(0);
    expect(hits("test:scale5", "198.51.100.2", 41)).toBe(1); // 101.ª petición en la ventana
  });

  it("valores inválidos o < 1 no bajan el tope (escala 1)", () => {
    for (const v of ["0", "-3", "abc", "0.5"]) {
      vi.stubEnv("QUORUM_RATELIMIT_SCALE", v);
      expect(rateLimitScale()).toBe(1);
    }
  });
});

describe("clientKey (anti-spoofing)", () => {
  it("prefiere cf-connecting-ip y si no, la última entrada de x-forwarded-for", async () => {
    const { clientKey } = await import("../ratelimit");
    const h = (o: Record<string, string>) => new Request("http://x", { headers: o });
    expect(clientKey(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientKey(h({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientKey(h({}))).toBe("local");
  });
});
