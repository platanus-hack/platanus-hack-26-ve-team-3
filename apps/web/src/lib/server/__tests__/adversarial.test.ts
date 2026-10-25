/**
 * Casos adversariales de docs/ADVERSARIAL_TESTS.md (rama docs/seguridad) contra los route handlers reales de apps/web,
 * con pruebas Semaphore REALES (Groth16) y firmas EIP-712 reales (cuentas viem locales, sin red).
 * Nada de la lógica bajo prueba está simulado: solo el store en memoria y, en AT-07(d), la ausencia de RPC.
 *
 *   AT-04  groupRoot cambiado tras /open
 *   AT-07  FaceBinding con firma ajena / reenviada (+ AT-07b ruido biométrico, AT-07c borrado de plantillas)
 *   AT-08  commitment duplicado inyectado
 *   AT-09  un tercero infla el censo / cierra la elección sin credenciales (AT-09(d) Kapso en units.test.ts)
 *   AT-10  privacidad de datos públicos y de la DB (public_data_privacy)
 */
import type { BallotEntry } from "@quorum/protocol-adapter";
import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { GET as listVoters, POST as addVoters } from "@/app/api/elections/[id]/voters/route";
import { POST as invites } from "@/app/api/elections/[id]/invites/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { POST as voted } from "@/app/api/voters/[id]/voted/route";
import { POST as openRoute } from "@/app/api/elections/[id]/open/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { GET as ledger } from "@/app/api/elections/[id]/ledger/route";
import { GET as receipt } from "@/app/api/elections/[id]/receipt/[inclusionId]/route";
import { GET as tally } from "@/app/api/elections/[id]/tally/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { GET as audit } from "@/app/api/elections/[id]/audit/route";
import { GET as getDraw, POST as draw } from "@/app/api/elections/[id]/draw/route";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { caracasDayStart, setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore } from "./helpers";
import type { MemoryStore } from "../store";

const artifactsPaths = defaultArtifacts();
let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
});

function election() {
  const now = Date.now();
  return {
    title: "Condominio Los Samanes (ficticio): ¿cuántos proyectos financiamos?",
    description: "Simulación. Opciones neutrales.",
    kind: "multiple",
    options: [1, 2, 3].map((n) => ({ id: `n${n}`, label: `${n} proyecto${n > 1 ? "s" : ""}` })),
    optionValues: [1, 2, 3],
    winnersCountFromResult: true,
    candidates: [
      { id: "p-01", label: "Iluminación del estacionamiento" },
      { id: "p-02", label: "Jardín comunal" },
      { id: "p-03", label: "Bomba de agua" },
    ],
    votingMode: "phased", // con hora de inicio (el modo continuo es el predeterminado)
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
  };
}

type Org = { id: string; auth: Record<string, string>; token: string };
type Account = ReturnType<typeof privateKeyToAccount>;

async function setupRegistration(): Promise<Org> {
  const created = await call(createElection, { body: election() });
  expect(created.status).toBe(201);
  const id = created.json.id as string;
  const token = created.json.organizerToken as string;
  const auth = { authorization: `Bearer ${token}` };
  expect((await call(publish, { params: { id }, headers: auth })).status).toBe(200);
  return { id, auth, token };
}

async function addVoter(org: Org, displayName: string, phoneE164?: string) {
  const r = await call(addVoters, { params: { id: org.id }, headers: org.auth, body: { voters: [{ displayName, phoneE164 }] } });
  expect(r.status).toBe(201);
  return r.json.voters[0] as { id: string; inviteToken: string };
}

function signBinding(account: Account, m: { electionId: string; voterId: string; faceBindingHash: `0x${string}`; wallet?: `0x${string}` }) {
  return account.signTypedData({
    domain: faceBindingDomain(),
    types: FaceBindingTypes,
    primaryType: "FaceBinding",
    message: { electionId: m.electionId, voterId: m.voterId, faceBindingHash: m.faceBindingHash, wallet: m.wallet ?? account.address },
  });
}

/** Rostro + wallet (sin identidad todavía). */
async function enrollAndLink(org: Org, seed: number, name: string, phoneE164?: string) {
  const v = await addVoter(org, name, phoneE164);
  const en = await call(enroll, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
  expect(en.status).toBe(201);
  const faceBindingHash = en.json.faceBindingHash as `0x${string}`;
  const account = privateKeyToAccount(generatePrivateKey());
  const w = await call(linkWallet, {
    params: { id: v.id },
    body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature: await signBinding(account, { electionId: org.id, voterId: v.id, faceBindingHash }) },
  });
  expect(w.status).toBe(200);
  return { ...v, account, faceBindingHash };
}

async function register(org: Org, seed: number, name = `Vecino ${seed}`, phoneE164?: string) {
  const v = await enrollAndLink(org, seed, name, phoneE164);
  const id = createVoterIdentity();
  const r = await call(identity, { params: { id: v.id }, body: { inviteToken: v.inviteToken, commitment: id.commitment } });
  expect(r.status).toBe(201);
  return { ...v, identity: id };
}

async function openIt(org: Org) {
  const o = await call(openRoute, { params: { id: org.id }, headers: org.auth });
  expect(o.status).toBe(200);
  return o.json as { groupRoot: string };
}

async function ballot(electionId: string, privateKey: string, option: number) {
  const r = await call(roll, { params: { id: electionId } });
  return castBallot(privateKey, r.json.commitments, electionId, option, artifactsPaths);
}

// ---------------------------------------------------------------------------
describe("AT-09 un tercero infla el censo o cierra la elección (C4)", () => {
  it("(a) POST /voters sin credenciales o con token ajeno → 401, sin inviteToken y sin crear votantes", async () => {
    const org = await setupRegistration();
    const other = await setupRegistration();
    for (const headers of [{}, { authorization: `Bearer ${other.token}` }, { authorization: `Bearer ${org.token}x` }] as Record<string, string>[]) {
      const r = await call(addVoters, { params: { id: org.id }, headers, body: { voters: Array.from({ length: 50 }, (_, i) => ({ displayName: `x${i}` })) } });
      expect(r.status).toBe(401);
      expect(JSON.stringify(r.json)).not.toMatch(/inviteToken|inviteUrl/);
    }
    expect(await store.listVoters(org.id)).toHaveLength(0);
    expect((await call(listVoters, { params: { id: org.id } })).json).toEqual({ counts: { total: 0, invited: 0, registered: 0, withIdentity: 0, voted: 0 } });
  });

  it("(b) sin token de invitación el atacante no puede empezar la inscripción (enroll / wallet / identity → 403/404)", async () => {
    const org = await setupRegistration();
    const real = await addVoter(org, "Ana");
    const forged = { inviteToken: "a".repeat(43) };
    expect((await call(enroll, { body: { voterId: real.id, ...forged, descriptor: descriptor(7), consent: true } })).status).toBe(403);
    expect((await call(enroll, { body: { voterId: "vt_inventado", ...forged, descriptor: descriptor(7), consent: true } })).status).toBe(404);
    const acct = privateKeyToAccount(generatePrivateKey());
    expect((await call(linkWallet, { params: { id: real.id }, body: { ...forged, walletAddress: acct.address, kind: "eoa-demo", bindingSignature: "0x00" } })).status).toBe(403);
    expect((await call(identity, { params: { id: real.id }, body: { ...forged, commitment: createVoterIdentity().commitment } })).status).toBe(403);
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
    expect((await store.getEngine(org.id))?.roll).toEqual([]);
  });

  it("(c) POST /close, /open, /invites y /draw sin credenciales → 401 y la elección no cambia de estado", async () => {
    const org = await setupRegistration();
    await register(org, 11);
    expect((await call(openRoute, { params: { id: org.id } })).status).toBe(401);
    await openIt(org);
    for (const h of [close, draw]) expect((await call(h, { params: { id: org.id } })).status).toBe(401);
    expect((await call(invites, { params: { id: org.id }, body: { electionId: org.id, voterIds: ["v"], channel: "dry-run" } })).status).toBe(401);
    expect((await call(getElection, { params: { id: org.id } })).json.status).toBe("open");
  }, 60_000);
});

// ---------------------------------------------------------------------------
describe("AT-04 groupRoot cambiado tras /open", () => {
  it("(1) /identity después de /open → 409 y groupRoot y /roll no cambian; (2) prueba contra un padrón con un miembro extra → 403 not_eligible", async () => {
    const org = await setupRegistration();
    const a = await register(org, 21);
    const b = await register(org, 22);
    const late = await enrollAndLink(org, 23, "Tardío"); // rostro + wallet, sin identidad
    const opened = await openIt(org);
    const rollBefore = (await call(roll, { params: { id: org.id } })).json;

    const extra = createVoterIdentity();
    const r1 = await call(identity, { params: { id: late.id }, body: { inviteToken: late.inviteToken, commitment: extra.commitment } });
    expect(r1.status).toBe(409);
    expect(r1.json.code).toBe("closed");
    const r2 = await call(identity, { params: { id: a.id }, body: { inviteToken: a.inviteToken, commitment: createVoterIdentity().commitment } });
    expect(r2.status).toBe(409);
    expect((await call(getElection, { params: { id: org.id } })).json.groupRoot).toBe(opened.groupRoot);
    expect((await call(roll, { params: { id: org.id } })).json).toEqual(rollBefore);
    expect(rollBefore.commitments).toEqual([a.identity.commitment, b.identity.commitment]);

    // (2) el atacante genera una prueba válida contra R1 = raíz(padrón + su commitment)
    const forged = await castBallot(extra.privateKey, [...rollBefore.commitments, extra.commitment], org.id, 0, artifactsPaths);
    expect(forged.merkleTreeRoot).not.toBe(opened.groupRoot);
    const v = await call(vote, { params: { id: org.id }, body: { proof: forged } });
    expect(v.status).toBe(403);
    expect(v.json.code).toBe("not_eligible");
    expect((await call(ledger, { params: { id: org.id } })).json.count).toBe(0);
  }, 60_000);
});

// ---------------------------------------------------------------------------
describe("AT-07 FaceBinding con firma ajena o reenviada", () => {
  it("(a) firma de W2 sobre {wallet: W1}, (b) replay para otro voterId u otra elección, (c) faceBindingHash ≠ H1 → 403 y el votante NO queda registrado; (d) kernel sin RPC → 503", async () => {
    const org = await setupRegistration();
    const otherOrg = await setupRegistration();
    const v1 = await addVoter(org, "V1");
    const v2 = await addVoter(org, "V2");
    const h1 = (await call(enroll, { body: { voterId: v1.id, inviteToken: v1.inviteToken, descriptor: descriptor(31), consent: true } })).json.faceBindingHash as `0x${string}`;
    const w1 = privateKeyToAccount(generatePrivateKey());
    const w2 = privateKeyToAccount(generatePrivateKey());
    const attempts: [string, `0x${string}`][] = [
      ["(a) firma de W2 sobre wallet W1", await signBinding(w2, { electionId: org.id, voterId: v1.id, faceBindingHash: h1, wallet: w1.address })],
      ["(b) replay para voterId V2", await signBinding(w1, { electionId: org.id, voterId: v2.id, faceBindingHash: h1 })],
      ["(b) replay de otra elección", await signBinding(w1, { electionId: otherOrg.id, voterId: v1.id, faceBindingHash: h1 })],
      ["(c) faceBindingHash distinto", await signBinding(w1, { electionId: org.id, voterId: v1.id, faceBindingHash: `0x${"22".repeat(32)}` })],
    ];
    for (const [label, bindingSignature] of attempts) {
      const r = await call(linkWallet, { params: { id: v1.id }, body: { inviteToken: v1.inviteToken, walletAddress: w1.address, kind: "eoa-demo", bindingSignature } });
      expect(r.status, label).toBe(403);
      expect(r.json.code, label).toBe("forbidden");
      const stored = await store.getVoter(v1.id);
      expect(stored?.registeredAt ?? null, label).toBeNull();
      expect(stored?.walletAddress ?? null, label).toBeNull();
    }
    const k = await call(linkWallet, { params: { id: v1.id }, body: { inviteToken: v1.inviteToken, walletAddress: w1.address, kind: "kernel", bindingSignature: "0x1234" } });
    expect(k.status).toBe(503);
    expect(k.json.code).toBe("unavailable");
    expect((await store.getVoter(v1.id))?.registeredAt ?? null).toBeNull();
    // control: la firma correcta sí registra
    const ok = await call(linkWallet, { params: { id: v1.id }, body: { inviteToken: v1.inviteToken, walletAddress: w1.address, kind: "eoa-demo", bindingSignature: await signBinding(w1, { electionId: org.id, voterId: v1.id, faceBindingHash: h1 }) } });
    expect(ok.status).toBe(200);
    expect(ok.json.registeredAt).toBeTruthy();
  });

  it("AT-07b (A4, limitación documentada): el dedupe 1:N detecta ruido pequeño (σ=0,05) pero un descriptor con ruido grande lo esquiva — no es un control de unicidad", async () => {
    const org = await setupRegistration();
    const v1 = await addVoter(org, "V1");
    const v2 = await addVoter(org, "V2");
    const v3 = await addVoter(org, "V3");
    const base = descriptor(41);
    expect((await call(enroll, { body: { voterId: v1.id, inviteToken: v1.inviteToken, descriptor: base, consent: true } })).status).toBe(201);
    // ruido gaussiano determinista (Box-Muller con LCG)
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) + 1) / 2147483649;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
    const small = base.map((x) => x + 0.05 * gauss());
    const r2 = await call(enroll, { body: { voterId: v2.id, inviteToken: v2.inviteToken, descriptor: small, consent: true } });
    expect(r2.status).toBe(409);
    expect(r2.json.code).toBe("duplicate_identity");
    const big = base.map((x) => x + 1.0 * gauss());
    const r3 = await call(enroll, { body: { voterId: v3.id, inviteToken: v3.inviteToken, descriptor: big, consent: true } });
    // Limitación A4: el descriptor lo calcula el cliente; con ruido suficiente el umbral (0,75) no lo marca.
    expect(r3.status).toBe(201);
  });

  it("AT-07c (A2): después de /open no queda ninguna plantilla facial de la elección", async () => {
    const org = await setupRegistration();
    await register(org, 51);
    await register(org, 52);
    expect(await store.listFaceTemplates(org.id)).toHaveLength(2);
    await openIt(org);
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("AT-08 commitment duplicado inyectado (M3)", () => {
  it("(a) V2 inscribe el commitment público de V1 → 409; (b) V1 lo reenvía → éxito idempotente SIN duplicar (reintento del mismo teléfono) y con otro commitment → 409; el padrón congelado no tiene duplicados", async () => {
    const org = await setupRegistration();
    const v1 = await register(org, 61);
    const v2 = await enrollAndLink(org, 62, "V2");
    const pub = (await call(roll, { params: { id: org.id } })).json.commitments as string[];
    expect(pub).toContain(v1.identity.commitment);
    const a = await call(identity, { params: { id: v2.id }, body: { inviteToken: v2.inviteToken, commitment: v1.identity.commitment } });
    expect(a.status).toBe(409);
    // (b) Reintento del mismo teléfono (respuesta perdida): éxito idempotente, el padrón no cambia.
    const before = (await call(roll, { params: { id: org.id } })).json.commitments as string[];
    const b = await call(identity, { params: { id: v1.id }, body: { inviteToken: v1.inviteToken, commitment: v1.identity.commitment } });
    expect(b.status).toBe(201);
    expect((await call(roll, { params: { id: org.id } })).json.commitments).toEqual(before);
    const b2 = await call(identity, { params: { id: v1.id }, body: { inviteToken: v1.inviteToken, commitment: createVoterIdentity().commitment } });
    expect(b2.status).toBe(409);
    // variante no canónica del mismo commitment → 400 (no se cuela como "otro" número)
    const c = await call(identity, { params: { id: v2.id }, body: { inviteToken: v2.inviteToken, commitment: `0${v1.identity.commitment}` } });
    expect(c.status).toBe(400);
    const ok = await call(identity, { params: { id: v2.id }, body: { inviteToken: v2.inviteToken, commitment: createVoterIdentity().commitment } });
    expect(ok.status).toBe(201);
    await openIt(org);
    const frozen = (await call(roll, { params: { id: org.id } })).json.commitments as string[];
    expect(new Set(frozen).size).toBe(frozen.length);
  });
});

// ---------------------------------------------------------------------------
describe("AT-10 privacidad de datos públicos y de la DB (public_data_privacy)", () => {
  it("votedAt se guarda con granularidad de día en America/Caracas (UTC−4)", () => {
    expect(caracasDayStart(new Date("2026-10-25T02:30:00.000Z")).toISOString()).toBe("2026-10-24T04:00:00.000Z");
    expect(caracasDayStart(new Date("2026-10-24T04:00:00.000Z")).toISOString()).toBe("2026-10-24T04:00:00.000Z");
    expect(caracasDayStart(new Date("2026-10-24T03:59:59.999Z")).toISOString()).toBe("2026-10-23T04:00:00.000Z");
  });

  it("tally en vivo por lotes de MIN_VOTES_FOR_BREAKDOWN (2): el 7.º voto no cambia el desglose hasta completar el lote; al cerrar, recuento exacto", async () => {
    const org = await setupRegistration();
    const vs = [];
    for (let i = 0; i < 7; i++) vs.push(await register(org, 90 + i));
    await openIt(org);
    const opts = [0, 0, 1, 2, 2, 1, 0];
    for (let i = 0; i < 7; i++) expect((await call(vote, { params: { id: org.id }, body: { proof: await ballot(org.id, vs[i].identity.privateKey, opts[i]) } })).status).toBe(201);
    const live = (await call(tally, { params: { id: org.id } })).json;
    expect(live.totalVotes).toBe(7);
    expect(live.options.map((o: { count: number }) => o.count)).toEqual([2, 2, 2]); // 6 del lote completo; el 7.º espera
    expect(live.leadingShare).toBeCloseTo(2 / 6);
    await call(close, { params: { id: org.id }, headers: org.auth });
    const final = (await call(tally, { params: { id: org.id } })).json;
    expect(final.options.map((o: { count: number }) => o.count)).toEqual([3, 2, 2]); // al cerrar, exacto
  }, 60_000);

  const PII_KEYS = ["displayName", "phoneE164", "inviteToken", "walletAddress", "faceBindingHash", "voterId"];

  it("6 votantes en orden conocido: ni las rutas públicas ni el store permiten reconstruir votante → opción", async () => {
    const org = await setupRegistration();
    const voters = [];
    for (let i = 0; i < 6; i++) voters.push(await register(org, 70 + i, `Vecina ${i}`, `+58412000000${i}`));
    await openIt(org);

    // Orden de voto distinto al de inscripción, opciones conocidas.
    const order = [3, 0, 5, 1, 4, 2];
    const choiceOf = new Map<string, number>([[voters[3].id, 2], [voters[0].id, 0], [voters[5].id, 1], [voters[1].id, 2], [voters[4].id, 0], [voters[2].id, 1]]);
    const snapshots: { tally: unknown; ledger: unknown; votersPub: unknown; votersOrg: { voters: { id: string; state: string }[] } }[] = [];
    for (const i of order) {
      const v = voters[i];
      const proof = await ballot(org.id, v.identity.privateKey, choiceOf.get(v.id)!);
      // C2: el body solo admite {proof}; campos que ligarían persona ↔ boleta se descartan y no se guardan
      // (y `onchain` se rechaza con 400: ver flow.test "solo ancla on-chain").
      const res = await call(vote, { params: { id: org.id }, body: { proof, voterId: v.id, inviteToken: v.inviteToken, walletAddress: v.account.address, commitment: v.identity.commitment } });
      expect(res.status).toBe(201);
      expect(res.json).not.toHaveProperty("txHash");
      expect((await call(voted, { params: { id: v.id }, body: { inviteToken: v.inviteToken } })).status).toBe(200);
      snapshots.push({
        tally: (await call(tally, { params: { id: org.id } })).json,
        ledger: (await call(ledger, { params: { id: org.id } })).json,
        votersPub: (await call(listVoters, { params: { id: org.id } })).json,
        votersOrg: (await call(listVoters, { params: { id: org.id }, headers: org.auth })).json,
      });
    }

    // C3 (vista pública durante `open`): el ledger no publica entradas ni mensajes; /voters público solo agregados.
    for (const s of snapshots) {
      expect(s.ledger).toMatchObject({ status: "open", proofsPublished: false, entries: [] });
      expect(JSON.stringify(s.ledger)).not.toMatch(/"message"|"nullifier"/);
      expect(s.votersPub).not.toHaveProperty("voters");
      for (const k of PII_KEYS) expect(JSON.stringify(s.votersPub)).not.toContain(k);
      for (const v of voters) expect(JSON.stringify([s.tally, s.ledger, s.votersPub])).not.toContain(v.account.address);
    }

    // C3 (organizador, que SÍ ve quién pasa a `voted`): cruzar cada cambio de estado con el cambio del tally
    // no debe revelar la opción de cada persona. Se intenta el ataque diferencial y se cuenta cuántos acierta.
    let linked = 0;
    let prevCounts: number[] = [0, 0, 0];
    let prevVoted = new Set<string>();
    for (const s of snapshots) {
      const counts = (s.tally as { options: { count: number | null }[] }).options.map((o) => o.count ?? 0);
      const nowVoted = new Set(s.votersOrg.voters.filter((x) => x.state === "voted").map((x) => x.id));
      const newcomers = [...nowVoted].filter((x) => !prevVoted.has(x));
      const diff = counts.map((c, i) => c - prevCounts[i]);
      if (newcomers.length === 1 && diff.reduce((a, b) => a + b, 0) === 1 && choiceOf.get(newcomers[0]) === diff.indexOf(1)) linked += 1;
      prevCounts = counts;
      prevVoted = nowVoted;
    }
    expect(linked, "votos ligados persona → opción por diferencias del tally en vivo").toBe(0);

    // C5 (DB): con SOLO el store (voters + engine) se intenta ordenar a los votantes por `votedAt` y emparejarlos
    // con el ledger por posición. No debe haber orden temporal fino que lo permita.
    const dbVoters = await store.listVoters(org.id);
    const engine = await store.getEngine(org.id);
    const votedAts = dbVoters.map((v) => v.votedAt);
    expect(votedAts.every(Boolean)).toBe(true);
    expect(new Set(votedAts).size, "votedAt no debe ordenar a los votantes").toBe(1);
    const byTime = [...dbVoters].sort((x, y) => (x.votedAt! < y.votedAt! ? -1 : x.votedAt! > y.votedAt! ? 1 : 0));
    const hits = byTime.filter((v, idx) => Number((engine!.ledger!.entries[idx] as BallotEntry).proof.message) === choiceOf.get(v.id)).length;
    expect(hits, "reconstrucción votante → opción desde la DB").toBeLessThan(dbVoters.length);
    // las boletas y los recibos no guardan nada del votante; el body extra de /vote no se guardó
    const engineJson = JSON.stringify(engine);
    for (const v of voters) {
      expect(engineJson).not.toContain(v.id);
      expect(engineJson).not.toContain(v.account.address);
      expect(engineJson).not.toContain(v.inviteToken);
    }
    for (const r of Object.values(engine!.receipts)) expect(Object.keys(r)).toEqual(["includedAt"]);

    // Cierre: nada de PII en ninguna salida pública (paquete, auditoría, ledger, tally, sorteo, elección, recibo).
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    expect((await call(draw, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    const nullifier = (engine!.ledger!.entries[0] as BallotEntry).proof.nullifier;
    const outputs = [
      (await call(artifacts, { params: { id: org.id } })).json,
      (await call(audit, { params: { id: org.id } })).json,
      (await call(ledger, { params: { id: org.id } })).json,
      (await call(tally, { params: { id: org.id } })).json,
      (await call(getDraw, { params: { id: org.id } })).json,
      (await call(getElection, { params: { id: org.id } })).json,
      (await call(listVoters, { params: { id: org.id } })).json,
      (await call(receipt, { params: { id: org.id, inclusionId: nullifier } })).json,
    ];
    const text = JSON.stringify(outputs);
    for (const k of PII_KEYS) expect(text, k).not.toContain(`"${k}"`);
    for (const v of voters) {
      for (const secret of [v.id, v.inviteToken, v.account.address, v.faceBindingHash, "Vecina", "+58412"]) expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(org.token);
  }, 120_000);
});
