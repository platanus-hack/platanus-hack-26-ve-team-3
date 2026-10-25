import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProvider, DryRunProvider, KapsoProvider, WaMeProvider, buildInviteMessage } from "@quorum/notify";
import { canonicalJson, hmacSha256Hex, keyFromSecret, open, seal, sha256Hex } from "../crypto";
import { manifestOf } from "../elections";
import { manifestHash } from "@quorum/protocol-adapter";
import { Election } from "@quorum/contracts";
import { cosineSimilarity } from "../face";
import { defaultLayout, generateLayout } from "../layout";
import { JsonFileStore } from "../store";
import { POST as kapsoWebhook } from "@/app/api/webhooks/kapso/route";
import { extractIncoming } from "../kapso";
import { POST as createElection } from "@/app/api/elections/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { POST as addVoters } from "@/app/api/elections/[id]/voters/route";
import { call, freshStore, sampleElection } from "./helpers";

describe("crypto y manifiesto", () => {
  it("canonicalJson ordena claves y el hash es estable", () => {
    expect(canonicalJson({ b: 1, a: [{ z: 1, y: 2 }] })).toBe('{"a":[{"y":2,"z":1}],"b":1}');
    const e = Election.parse({ ...sampleElection(), id: "el_m", status: "draft", protocol: "semaphore-ledger", manifestHash: null, eligibilityIssuerId: "i", organizerId: "o" });
    const m = manifestOf(e);
    expect(m).toMatchObject({ electionId: "el_m", protocol: "semaphore-ledger", merkleTreeDepth: 10, label: "simulación" });
    expect(m).not.toHaveProperty("drawRule");
    const h1 = manifestHash(m);
    expect(h1).toBe(`0x${sha256Hex(canonicalJson(m))}`);
    expect(manifestHash(manifestOf({ ...e, title: `${e.title}!` }))).not.toBe(h1);
    // A5: candidatos y tieBreak entran en el manifiesto (y por tanto en manifestHash)
    const withDraw = { ...e, candidates: [{ id: "p1", label: "P1" }], winnersCountFromResult: true, optionValues: [1, 2, 3] };
    expect(manifestOf(withDraw).drawRule).toEqual({ candidates: [{ id: "p1", label: "P1" }], winnersCount: { kind: "from-result", optionValues: [1, 2, 3] }, tieBreak: "lowest" });
    expect(manifestHash(manifestOf({ ...withDraw, candidates: [{ id: "p2", label: "P1" }] }))).not.toBe(manifestHash(manifestOf(withDraw)));
  });

  it("foto y subtítulo de una opción: el manifiesto lleva subtitle e imageSha256 (nunca la foto); cambiar la foto cambia manifestHash", () => {
    const img = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    const base = Election.parse({ ...sampleElection(), id: "el_f", status: "draft", protocol: "semaphore-ledger", manifestHash: null, eligibilityIssuerId: "i", organizerId: "o" });
    const e = { ...base, options: [{ id: "a", label: "Ana", subtitle: "Equipo Trust", image: img }, { id: "b", label: "Beto" }] };
    const m = manifestOf(e);
    expect(m.options[0]).toEqual({ id: "a", label: "Ana", subtitle: "Equipo Trust", imageSha256: `0x${sha256Hex(img)}` });
    expect(m.options[1]).toEqual({ id: "b", label: "Beto" });
    expect(JSON.stringify(m)).not.toContain("base64");
    const other = { ...e, options: [{ ...e.options[0], image: img.replace("Kp//2Q==", "Kq//2Q==") }, e.options[1]] };
    expect(manifestHash(manifestOf(other))).not.toBe(manifestHash(m));
  });

  it("AES-256-GCM sella y abre; clave incorrecta falla", () => {
    const k = keyFromSecret("secreto-dev");
    const blob = seal(k, "[0.1,0.2]");
    expect(open(k, blob)).toBe("[0.1,0.2]");
    expect(() => open(keyFromSecret("otra"), blob)).toThrow();
    expect(keyFromSecret("ab".repeat(32)).toString("hex")).toBe("ab".repeat(32));
  });

  it("similitud coseno", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
  });
});

describe("layout", () => {
  it("default por kind válido y sin AI_GATEWAY_API_KEY usa default", async () => {
    for (const kind of ["yes-no", "multiple", "ranking", "budget"] as const) expect(defaultLayout(kind).tiles.length).toBeGreaterThanOrEqual(2);
    const r = await generateLayout({ kind: "yes-no", optionCount: 2, durationMin: 60 });
    expect(r.source).toBe("default");
    expect(r.layout).toEqual(defaultLayout("yes-no"));
  });
});

describe("JsonFileStore", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persiste y recarga desde disco", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "quorum-store-"));
    const a = new JsonFileStore(dir);
    await a.init();
    await a.putElection({ ...(sampleElection() as object), id: "el_x", status: "draft", protocol: "semaphore-ledger", manifestHash: null, eligibilityIssuerId: "i", organizerId: "o", layout: null } as never);
    await a.putOrganizerTokenHash("el_x", sha256Hex("tok"));
    const raw = JSON.parse(await readFile(path.join(dir, "organizerTokens.json"), "utf8"));
    expect(raw.el_x.tokenHash).toBe(sha256Hex("tok"));
    expect(JSON.stringify(raw)).not.toContain('"tok"');

    const b = new JsonFileStore(dir);
    await b.init();
    expect((await b.getElection("el_x"))?.id).toBe("el_x");
    expect(await b.getOrganizerTokenHash("el_x")).toBe(sha256Hex("tok"));
  });
});

describe("@quorum/notify", () => {
  it("dry-run registra y devuelve sent; wame devuelve link wa.me", async () => {
    const lines: string[] = [];
    const dry = new DryRunProvider((l) => lines.push(l));
    const r = await dry.send("+584121234567", "Ana", "http://localhost:3000/v/tok");
    expect(r.status).toBe("sent");
    expect(lines[0]).toContain("***4567");
    expect(lines[0]).not.toContain("+58412");

    const w = await new WaMeProvider().send("+584121234567", "Ana", "http://localhost:3000/v/tok");
    expect(w.status).toBe("pending");
    expect(w.link).toBe(`https://wa.me/584121234567?text=${encodeURIComponent(buildInviteMessage("Ana", "http://localhost:3000/v/tok"))}`);
  });

  it("kapso/meta se degradan a dry-run sin aprobación o sin credenciales", () => {
    const noApproval = createProvider({ INVITE_CHANNEL: "kapso", KAPSO_API_KEY: "k", KAPSO_PHONE_NUMBER_ID: "p" });
    expect(noApproval.channel).toBe("dry-run");
    expect(noApproval.note).toContain("INVITE_SEND_APPROVED");
    const noCreds = createProvider({ INVITE_SEND_APPROVED: "true" }, "meta");
    expect(noCreds.channel).toBe("dry-run");
    expect(noCreds.note).toContain("META_ACCESS_TOKEN");
    const ok = createProvider({ INVITE_SEND_APPROVED: "true", KAPSO_API_KEY: "k", KAPSO_PHONE_NUMBER_ID: "p" }, "kapso");
    expect(ok.channel).toBe("kapso");
    expect(ok.note).toBeNull();
  });

  it("KapsoProvider arma el request de texto y de template (fetch simulado, sin red)", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const text = new KapsoProvider({ apiKey: "k", phoneNumberId: "123", fetchImpl });
    const r = await text.send("+584121234567", "Ana", "http://localhost:3000/v/tok");
    expect(r).toEqual({ status: "sent", messageId: "wamid.1" });
    expect(calls[0].url).toBe("https://api.kapso.ai/meta/whatsapp/v24.0/123/messages");
    expect((calls[0].init.headers as Record<string, string>)["X-API-Key"]).toBe("k");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.to).toBe("584121234567");
    expect(body.type).toBe("text");
    expect(body.text.preview_url).toBe(true);

    const tpl = new KapsoProvider({ apiKey: "k", phoneNumberId: "123", useTemplate: true, fetchImpl });
    await tpl.send("+584121234567", "Ana", "http://localhost:3000/v/tok");
    const body2 = JSON.parse(String(calls[1].init.body));
    expect(body2.template.name).toBe("quorum_invite");
    expect(body2.template.components[1].parameters[0].text).toBe("tok");

    const failing = new KapsoProvider({ apiKey: "k", phoneNumberId: "123", fetchImpl: (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch });
    const f = await failing.send("+584121234567", "Ana", "u");
    expect(f.status).toBe("failed");
    expect(f.error).toContain("http_401");
  });
});

describe("webhook Kapso", () => {
  const secret = "test-webhook-secret";
  const signed = (body: string) => ({ "x-webhook-signature": hmacSha256Hex(secret, body) });

  it("rechaza firma inválida", async () => {
    const r = await call(kapsoWebhook, { rawBody: "{}", headers: { "x-webhook-signature": "00" } });
    expect(r.status).toBe(401);
  });

  it("extrae mensajes de varias formas de evento", () => {
    expect(extractIncoming({ event: "whatsapp.message.received", data: { message: { from: "584121234567", text: { body: "QUORUM el_1" } } } })).toEqual([
      { from: "584121234567", text: "QUORUM el_1", profileName: undefined },
    ]);
    expect(extractIncoming({ event: "whatsapp.message.delivered", data: { message: { from: "1", text: { body: "x" } } } })).toEqual([]);
    const meta = { entry: [{ changes: [{ value: { contacts: [{ profile: { name: "Ana" } }], messages: [{ from: "584121234567", text: { body: "hola" } }] } }] }] };
    expect(extractIncoming(meta)).toEqual([{ from: "584121234567", text: "hola", profileName: "Ana" }]);
  });

  it("AT-09(d) / A6: opt-in QUORUM <id> NO crea votantes; solo reenvía el enlace a quien el organizador cargó con ese teléfono (dry-run); batch y dedupe", async () => {
    const store = freshStore();
    const created = await call(createElection, { body: sampleElection() });
    const id = created.json.id as string;
    const auth = { authorization: `Bearer ${created.json.organizerToken}` };
    await call(publish, { params: { id }, headers: auth });

    const optIn = (from: string, key: string) => {
      const body = JSON.stringify({
        batch: true,
        events: [
          { event: "whatsapp.message.received", data: { message: { from, text: { body: `QUORUM ${id}` } }, contact: { name: "Ana" } } },
          { event: "whatsapp.message.received", data: { message: { from, text: { body: "hola" } } } },
          { event: "whatsapp.message.received", data: { message: { from: "584129999999", text: { body: "QUORUM el_inexistente" } } } },
        ],
      });
      return { body, headers: { ...signed(body), "x-idempotency-key": key } };
    };

    // Número desconocido: se ignora y NO aparece ningún votante.
    const unknown = optIn("584121234567", "evt-0");
    const r0 = await call(kapsoWebhook, { rawBody: unknown.body, headers: unknown.headers });
    expect(r0.status).toBe(200);
    expect(r0.json).toEqual({ ok: true, received: 3, sent: 0, ignored: 3, failed: 0 });
    expect(await store.listVoters(id)).toHaveLength(0);
    expect(await store.getVoterByPhone(id, "+584121234567")).toBeNull(); // AT-09(d): sin rastro en el store

    // El organizador carga a Ana con su teléfono → el opt-in le reenvía su enlace.
    const added = await call(addVoters, { params: { id }, headers: auth, body: { voters: [{ displayName: "Ana", phoneE164: "+584121234567" }] } });
    expect(added.status).toBe(201);
    const known = optIn("584121234567", "evt-1");
    const r = await call(kapsoWebhook, { rawBody: known.body, headers: known.headers });
    expect(r.json).toEqual({ ok: true, received: 3, sent: 1, ignored: 2, failed: 0 });
    const voters = await store.listVoters(id);
    expect(voters).toHaveLength(1);
    expect(voters[0].source).toBe("invite");
    expect(voters[0].id).toBe(added.json.voters[0].id);
    expect(voters[0].inviteToken).toBe(added.json.voters[0].inviteToken);
    expect(voters[0].inviteStatus).toBe("sent");

    // Misma idempotency key → duplicate; otra key → reenvía sin duplicar votante
    const dup = await call(kapsoWebhook, { rawBody: known.body, headers: known.headers });
    expect(dup.json.duplicate).toBe(true);
    const again = optIn("584121234567", "evt-2");
    expect((await call(kapsoWebhook, { rawBody: again.body, headers: again.headers })).json.sent).toBe(1);
    expect(await store.listVoters(id)).toHaveLength(1);
  });
});
