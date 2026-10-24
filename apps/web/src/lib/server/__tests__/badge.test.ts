/**
 * D-19 — credencial del evento (QR). Patrón exacto, HMAC (nunca el usuario en claro), badge_used / badge_unknown /
 * badge_invalid, consulta en vivo con fetch simulado (timeout, caché, HEAD→GET), lista permitida, configuración por
 * elección, rostro obligatorio y `rollPolicy: event-badge` en el paquete verificado (pruebas Semaphore REALES).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEFAULT_BADGE_URL_PREFIX, FaceBindingTypes, parseBadgeUrl } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { PUT as putEligibility } from "@/app/api/elections/[id]/eligibility/route";
import { POST as openRoomRoute } from "@/app/api/elections/[id]/room/route";
import { GET as roomInfo } from "@/app/api/rooms/[roomCode]/route";
import { POST as join } from "@/app/api/rooms/[roomCode]/join/route";
import { POST as joinBadge } from "@/app/api/rooms/[roomCode]/join-badge/route";
import { GET as listVoters } from "@/app/api/elections/[id]/voters/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { POST as openRoute } from "@/app/api/elections/[id]/open/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { GET as audit } from "@/app/api/elections/[id]/audit/route";
import { badgeHash, BADGE_LIVE_TIMEOUT_MS, checkBadgeLive, clearBadgeCacheForTests, setBadgeFetchForTests } from "../badge";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore, sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

const P = DEFAULT_BADGE_URL_PREFIX;
let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
  setBadgeFetchForTests(undefined);
  clearBadgeCacheForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setBadgeFetchForTests(undefined);
});

type Org = { id: string; auth: Record<string, string> };

async function setup(eligibility: unknown): Promise<Org & { code: string }> {
  const created = await call(createElection, { body: sampleElection({ eligibility }) });
  expect(created.status).toBe(201);
  const org = { id: created.json.id as string, auth: { authorization: `Bearer ${created.json.organizerToken}` } };
  expect((await call(publish, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
  const room = await call(openRoomRoute, { params: { id: org.id }, headers: org.auth, body: { maxSeats: 60, expiresInMin: 15 } });
  return { ...org, code: room.json.roomCode as string };
}

let ipSeq = 0;
function scan(code: string, badgeUrl: unknown) {
  return call(joinBadge, { params: { roomCode: code }, body: { badgeUrl }, headers: { "x-forwarded-for": `10.9.0.${++ipSeq}` } });
}

async function register(org: Org, v: { voterId: string; inviteToken: string }, seed: number) {
  const en = await call(enroll, { body: { voterId: v.voterId, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
  if (en.status !== 201) return { enroll: en };
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await account.signTypedData({
    domain: faceBindingDomain(),
    types: FaceBindingTypes,
    primaryType: "FaceBinding",
    message: { electionId: org.id, voterId: v.voterId, faceBindingHash: en.json.faceBindingHash, wallet: account.address },
  });
  expect((await call(linkWallet, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } })).status).toBe(200);
  const id = createVoterIdentity();
  expect((await call(identity, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, commitment: id.commitment } })).status).toBe(201);
  return { enroll: en, identity: id };
}

describe("parseBadgeUrl — patrón exacto", () => {
  it("acepta la credencial real y extrae el usuario", () => {
    expect(parseBadgeUrl("https://hack.platan.us/26-ve/id/jgalvis414")).toBe("jgalvis414");
    expect(parseBadgeUrl("  https://hack.platan.us/26-ve/id/Some-User  \n")).toBe("Some-User");
    expect(parseBadgeUrl(`${P}${"a".repeat(39)}`)).toBe("a".repeat(39));
  });
  it("rechaza todo lo demás", () => {
    for (const bad of [
      "http://hack.platan.us/26-ve/id/jgalvis414",
      "https://hack.platan.us/26-ve/id/",
      "https://hack.platan.us/26-ve/id/jgalvis414/",
      "https://hack.platan.us/26-ve/id/jgalvis414?x=1",
      "https://hack.platan.us/26-ve/id/jga_lvis",
      "https://hack.platan.us/26-ve/id/../admin",
      "https://hack.platan.us/25-cl/id/jgalvis414",
      "https://hackXplatan.us/26-ve/id/jgalvis414",
      "https://evil.example/https://hack.platan.us/26-ve/id/jgalvis414",
      `${P}${"a".repeat(40)}`,
      "jgalvis414",
      "WIFI:S:evento;T:WPA;P:clave;;",
    ])
      expect(parseBadgeUrl(bad), bad).toBeNull();
  });
  it("el prefijo es configurable (y se escapa: el punto no es comodín)", () => {
    expect(parseBadgeUrl("https://otro.evento.org/b/ana", "https://otro.evento.org/b/")).toBe("ana");
    expect(parseBadgeUrl("https://otroXevento.org/b/ana", "https://otro.evento.org/b/")).toBeNull();
  });
});

describe("HMAC de la credencial", () => {
  it("determinista, insensible a mayúsculas, distinto por elección y por clave; nunca contiene el usuario", () => {
    vi.stubEnv("BADGE_KEY", "k1");
    const h = badgeHash("el_a", "JGalvis414");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(badgeHash("el_a", "jgalvis414"));
    expect(h).not.toBe(badgeHash("el_b", "jgalvis414"));
    expect(h).not.toContain("jgalvis414");
    vi.stubEnv("BADGE_KEY", "k2");
    expect(badgeHash("el_a", "jgalvis414")).not.toBe(h);
  });
  it("sin BADGE_KEY se deriva de FACE_KEY (fallback documentado)", () => {
    vi.stubEnv("BADGE_KEY", "");
    vi.stubEnv("FACE_KEY", "f".repeat(64));
    const a = badgeHash("el_a", "x");
    vi.stubEnv("FACE_KEY", "e".repeat(64));
    expect(badgeHash("el_a", "x")).not.toBe(a);
  });
});

describe("Consulta en vivo (fetch simulado)", () => {
  it("200 → existe, 404 → no existe; resultados en caché (una sola consulta por URL)", async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<{ status: number }>>(async (url) => ({ status: url.endsWith("/ana") ? 200 : 404 }));
    setBadgeFetchForTests(f);
    expect(await checkBadgeLive(`${P}ana`)).toBe(true);
    expect(await checkBadgeLive(`${P}ana`)).toBe(true);
    expect(await checkBadgeLive(`${P}nadie`)).toBe(false);
    expect(await checkBadgeLive(`${P}nadie`)).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
  });
  it("HEAD no soportado (405) → reintenta con GET", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => ({ status: init.method === "HEAD" ? 405 : 200 }));
    setBadgeFetchForTests(f);
    expect(await checkBadgeLive(`${P}bea`)).toBe(true);
    expect(f.mock.calls.map((c) => c[1].method)).toEqual(["HEAD", "GET"]);
  });
  it("tiempo límite de 3 s / error / 5xx → 503 y NO se cachea", async () => {
    let signal: AbortSignal | undefined;
    setBadgeFetchForTests(
      (_u, init) =>
        new Promise((_res, rej) => {
          signal = init.signal ?? undefined;
          init.signal?.addEventListener("abort", () => rej(new Error("timeout")));
        }),
    );
    const t0 = Date.now();
    await expect(checkBadgeLive(`${P}lento`)).rejects.toMatchObject({ status: 503 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(BADGE_LIVE_TIMEOUT_MS - 100);
    expect(Date.now() - t0).toBeLessThan(BADGE_LIVE_TIMEOUT_MS + 1500);
    expect(signal?.aborted).toBe(true);
    setBadgeFetchForTests(async () => ({ status: 502 }));
    await expect(checkBadgeLive(`${P}lento`)).rejects.toMatchObject({ status: 503 });
    setBadgeFetchForTests(async () => ({ status: 200 }));
    expect(await checkBadgeLive(`${P}lento`)).toBe(true);
  }, 10_000);
  it("consultas simultáneas a la misma URL comparten una sola petición", async () => {
    const f = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { status: 200 };
    });
    setBadgeFetchForTests(f);
    await Promise.all(Array.from({ length: 5 }, () => checkBadgeLive(`${P}multi`)));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/rooms/:code/join-badge", () => {
  it("live: entra, crea votante source:badge 'Participante'; reusar → 409 badge_used; desconocida → 404; QR ajeno → 400", async () => {
    setBadgeFetchForTests(async (url) => ({ status: /\/(jgalvis414|otra)$/i.test(url) ? 200 : 404 }));
    const org = await setup({ method: "event-badge" });

    const info = await call(roomInfo, { params: { roomCode: org.code } });
    expect(info.json.eligibility).toEqual({ method: "event-badge", badgeUrlPrefix: P });

    const ok = await scan(org.code, `${P}jgalvis414`);
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ electionId: org.id, displayName: "Participante" });
    expect(ok.json.inviteToken).toBeTruthy();
    expect((await store.getVoter(ok.json.voterId))!.source).toBe("badge");

    const again = await scan(org.code, `${P}JGALVIS414`);
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ code: "badge_used", error: "Esta credencial ya se usó en esta votación." });

    const unknown = await scan(org.code, `${P}nadie-aqui`);
    expect(unknown.status).toBe(404);
    expect(unknown.json).toEqual({ code: "badge_unknown", error: "No encontramos esta credencial en el evento." });

    const foreign = await scan(org.code, "https://example.com/menu");
    expect(foreign.status).toBe(400);
    expect(foreign.json).toEqual({ code: "badge_invalid", error: "Ese QR no es una credencial de Platanus Hack." });

    // Nada en claro: el store solo tiene el HMAC y sin voterId.
    const dump = JSON.stringify([...((store as unknown as { data: Record<string, Map<string, unknown>> }).data.badgeUses.values())]);
    expect(dump).not.toMatch(/jgalvis414/i);
    expect(dump).not.toContain(ok.json.voterId);
    expect(dump).toContain(badgeHash(org.id, "jgalvis414"));
    expect(JSON.stringify((await store.getVoter(ok.json.voterId))!)).not.toMatch(/jgalvis414/i);

    // Con credenciales, el alias libre queda cerrado.
    const alias = await call(join, { params: { roomCode: org.code }, body: { displayName: "Colado" }, headers: { "x-forwarded-for": "10.9.9.9" } });
    expect(alias.status).toBe(400);
  });

  it("concurrente: la misma credencial dos veces a la vez → exactamente una entra", async () => {
    setBadgeFetchForTests(async () => ({ status: 200 }));
    const org = await setup({ method: "event-badge" });
    const rs = await Promise.all([scan(org.code, `${P}doble`), scan(org.code, `${P}doble`), scan(org.code, `${P}Doble`)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it("live sin respuesta → 503 y la credencial NO queda gastada", async () => {
    setBadgeFetchForTests(async () => ({ status: 500 }));
    const org = await setup({ method: "event-badge", badgeCheck: "live" });
    expect((await scan(org.code, `${P}ana`)).status).toBe(503);
    setBadgeFetchForTests(async () => ({ status: 200 }));
    expect((await scan(org.code, `${P}ana`)).status).toBe(201);
  });

  it("list: solo usuarios cargados (sin red); la elección pública nunca expone la lista", async () => {
    const f = vi.fn(async () => ({ status: 200 }));
    setBadgeFetchForTests(f);
    const org = await setup({ method: "event-badge", badgeCheck: "list", badgeAllowlist: ["Ana-1", "beto", "beto"] });
    const e = await call(getElection, { params: { id: org.id } });
    expect(e.json.eligibility).toEqual({ method: "event-badge", badgeCheck: "list", badgeUrlPrefix: P, allowlistCount: 2 });
    expect(JSON.stringify(e.json)).not.toMatch(/ana-1|beto/i);
    expect((await scan(org.code, `${P}ana-1`)).status).toBe(201);
    expect((await scan(org.code, `${P}carla`)).json.code).toBe("badge_unknown");
    expect((await scan(org.code, `${P}ANA-1`)).json.code).toBe("badge_used");
    expect(f).not.toHaveBeenCalled();
  });

  it("none: cualquier usuario con el patrón, una vez", async () => {
    const org = await setup({ method: "event-badge", badgeCheck: "none" });
    expect((await scan(org.code, `${P}quien-sea`)).status).toBe(201);
    expect((await scan(org.code, `${P}quien-sea`)).status).toBe(409);
  });

  it("prefijo configurable por votación", async () => {
    const org = await setup({ method: "event-badge", badgeCheck: "none", badgeUrlPrefix: "https://otro.evento.org/b/" });
    expect((await scan(org.code, `${P}ana`)).json.code).toBe("badge_invalid");
    expect((await scan(org.code, "https://otro.evento.org/b/ana")).status).toBe(201);
  });

  it("votación con apodo libre: join-badge → 400 (no usa credenciales)", async () => {
    const org = await setup(undefined);
    const r = await scan(org.code, `${P}ana`);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("invalid_input");
  });

  it("rate limit por IP (escala con QUORUM_RATELIMIT_SCALE)", async () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    vi.stubEnv("BADGE_JOIN_RATE_PER_MIN", "2");
    const org = await setup({ method: "event-badge", badgeCheck: "none" });
    const same = (u: string) => call(joinBadge, { params: { roomCode: org.code }, body: { badgeUrl: `${P}${u}` }, headers: { "x-forwarded-for": "10.77.0.1" } });
    expect((await same("r1")).status).toBe(201);
    expect((await same("r2")).status).toBe(201);
    expect((await same("r3")).status).toBe(429);
    vi.stubEnv("QUORUM_RATELIMIT_SCALE", "3");
    expect((await same("r4")).status).toBe(201);
  });
});

describe("PUT /api/elections/:id/eligibility", () => {
  it("organizador cambia el método antes de que entre nadie; después → 409; 'list' → 400; sin token → 401", async () => {
    const org = await setup(undefined);
    expect((await call(putEligibility, { method: "PUT", params: { id: org.id }, body: { method: "event-badge" } })).status).toBe(401);
    const soon = await call(putEligibility, { method: "PUT", params: { id: org.id }, headers: org.auth, body: { method: "list" } });
    expect(soon.status).toBe(400);
    const ok = await call(putEligibility, { method: "PUT", params: { id: org.id }, headers: org.auth, body: { method: "event-badge", badgeCheck: "none" } });
    expect(ok.status).toBe(200);
    expect(ok.json.eligibility).toMatchObject({ method: "event-badge", badgeCheck: "none" });
    expect((await scan(org.code, `${P}ana`)).status).toBe(201);
    const late = await call(putEligibility, { method: "PUT", params: { id: org.id }, headers: org.auth, body: { method: "open-alias" } });
    expect(late.status).toBe(409);
  });
  it("crear con 'list' sin usuarios → 400", async () => {
    const r = await call(createElection, { body: sampleElection({ eligibility: { method: "event-badge", badgeCheck: "list", badgeAllowlist: [] } }) });
    expect(r.status).toBe(400);
  });
});

describe("Credencial + rostro obligatorio → paquete de auditoría", () => {
  it("dos credenciales de la misma persona: el rostro la frena (revisión manual D-21, se rechaza sola al abrir); rollPolicy event-badge verificado", async () => {
    const org = await setup({ method: "event-badge", badgeCheck: "list", badgeAllowlist: ["ana", "beto", "ana-otra"] });
    const a = (await scan(org.code, `${P}ana`)).json;
    const b = (await scan(org.code, `${P}beto`)).json;
    const c = (await scan(org.code, `${P}ana-otra`)).json;
    const ra = await register(org, a, 901);
    await register(org, b, 902);
    // Misma persona con otra credencial → el dedupe facial la frena: queda en revisión manual (D-21), no inscrita.
    const rc = await register(org, c, 901);
    expect(rc.enroll.status).toBe(202);
    expect(rc.enroll.json).toEqual({ status: "pending_review" });

    const vs = await call(listVoters, { params: { id: org.id }, headers: org.auth });
    expect((vs.json.voters as { source: string; displayName: string }[]).every((v) => v.source === "badge" && v.displayName === "Participante")).toBe(true);

    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    const r = await call(roll, { params: { id: org.id } });
    const proof = await castBallot(ra.identity!.privateKey, r.json.commitments, org.id, 0, defaultArtifacts());
    expect((await call(vote, { params: { id: org.id }, body: { proof } })).status).toBe(201);
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");

    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.json.rollPolicy).toMatchObject({ kind: "event-badge", maxSeats: 60, check: "list", face: "full", joined: 3, enrolled: 2, eligibility: "badge-once+face-dedupe-demo" });
    expect(art.json.manualApprovals).toMatchObject({ count: 0, method: "organizer-in-person" });
    expect(art.json.rollPolicy.note).toMatch(/la credencial demuestra que es participante del evento y se usa una sola vez; el rostro impide que una misma persona use varias credenciales/);
    const raw = JSON.stringify(art.json);
    for (const s of ["ana", "beto", badgeHash(org.id, "ana"), a.voterId]) expect(raw).not.toContain(s);

    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.auditResult.valid).toBe(true);
    expect((au.json.auditResult.unsupportedGuarantees as string[]).find((g) => g.startsWith("credencial-de-evento"))).toMatch(/El QR de la credencial no es secreto/);
  }, 60_000);
});
