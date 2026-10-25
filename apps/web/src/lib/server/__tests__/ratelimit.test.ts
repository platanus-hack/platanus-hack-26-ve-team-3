import { afterEach, describe, expect, it, vi } from "vitest";
import { failureLimit, rateLimit, rateLimitBy, rateLimitScale, VOTER_IP_LIMIT, VOTER_STEP_LIMIT } from "../ratelimit";

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

describe("topes del votante: por credencial, con la IP como freno alto", () => {
  afterEach(() => vi.unstubAllEnvs());

  const tryHit = (fn: () => void) => {
    try {
      fn();
      return 0;
    } catch {
      return 1;
    }
  };

  it("150 teléfonos en el mismo wifi, un paso cada uno: ninguno recibe 429", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    let rejected = 0;
    for (let i = 0; i < 150; i++) {
      rejected += tryHit(() => rateLimit(req("198.51.100.9"), "test:voter-ip", VOTER_IP_LIMIT));
      rejected += tryHit(() => rateLimitBy("test:voter-step", `vt_${i}`, `tok_${i}`, VOTER_STEP_LIMIT));
    }
    expect(rejected).toBe(0);
  });

  it("una misma credencial pasa el tope aunque cambie de IP", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    let rejected = 0;
    for (let i = 0; i < VOTER_STEP_LIMIT + 3; i++) rejected += tryHit(() => rateLimitBy("test:same-voter", "vt_abuse", "tok_abuse", VOTER_STEP_LIMIT));
    expect(rejected).toBe(3);
  });

  it("quien conoce el voterId sin el token no agota el cupo de la persona", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    for (let i = 0; i < VOTER_STEP_LIMIT * 3; i++) tryHit(() => rateLimitBy("test:lockout", "vt_victim", `adivinado_${i % 3}`, VOTER_STEP_LIMIT));
    expect(tryHit(() => rateLimitBy("test:lockout", "vt_victim", "tok_real", VOTER_STEP_LIMIT))).toBe(0);
  });

  it("credenciales del evento: solo los intentos fallidos cuentan, también en paralelo", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    const r = req("198.51.100.11");
    for (let i = 0; i < 50; i++) failureLimit(r, "test:badge-fail", 10).ok();
    const inFlight = Array.from({ length: 15 }, () => tryHit(() => failureLimit(r, "test:badge-fail", 10)));
    expect(inFlight.filter(Boolean)).toHaveLength(5);
  });

  it("una sola IP abusando sigue frenada por el tope alto", () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    let rejected = 0;
    for (let i = 0; i < VOTER_IP_LIMIT + 5; i++) rejected += tryHit(() => rateLimit(req("198.51.100.10"), "test:ip-abuse", VOTER_IP_LIMIT));
    expect(rejected).toBe(5);
  });
});
