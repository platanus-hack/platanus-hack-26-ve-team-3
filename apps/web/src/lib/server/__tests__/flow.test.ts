/**
 * Contrato v1 contra los route handlers reales (sin servidor HTTP), con pruebas Semaphore REALES (Groth16):
 * crear → publicar (registration) → censo → rostro (dedupe 1:N) → wallet (EIP-712 FaceBinding) → identidad
 * → open (groupRoot) → voto {proof} → ledger/recibo → close (paquete + verifyPackage real) → draw → audit/verify.
 */
import type { BallotEntry } from "@quorum/protocol-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts, drawWinners, encodeAnchorCalldata, type SemaphoreProof } from "@quorum/protocol-adapter";
import { encodeAnchor, registryAbi } from "@quorum/wallet";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, getAddress, type Hex } from "viem";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { GET as listVoters, POST as addVoters } from "@/app/api/elections/[id]/voters/route";
import { POST as invites } from "@/app/api/elections/[id]/invites/route";
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as faceVerify } from "@/app/api/face/verify/route";
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
import { POST as auditVerify } from "@/app/api/audit/verify/route";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore } from "./helpers";
import type { MemoryStore } from "../store";

const artifactsPaths = defaultArtifacts();
let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Elección ficticia "Condominio Los Samanes": ¿cuántos proyectos financiamos? (1..5) + 6 proyectos postulados. */
function samanes() {
  const now = Date.now();
  return {
    title: "Condominio Los Samanes (ficticio): ¿cuántos proyectos financiamos?",
    description: "Simulación. Opciones neutrales.",
    kind: "multiple",
    options: [1, 2, 3, 4, 5].map((n) => ({ id: `n${n}`, label: `${n} proyecto${n > 1 ? "s" : ""}` })),
    optionValues: [1, 2, 3, 4, 5],
    winnersCountFromResult: true,
    candidates: [
      { id: "p-01", label: "Iluminación del estacionamiento", amount: 1200 },
      { id: "p-02", label: "Jardín comunal", amount: 800 },
      { id: "p-03", label: "Bomba de agua", amount: 2500 },
      { id: "p-04", label: "Cámaras de la entrada", amount: 1800 },
      { id: "p-05", label: "Techo del salón de fiestas", amount: 3000 },
      { id: "p-06", label: "Pintura de la fachada", amount: 2200 },
    ],
    votingMode: "phased", // con hora de inicio (el modo continuo es el predeterminado)
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
  };
}

type Org = { id: string; auth: Record<string, string> };

async function setupRegistration(body: Record<string, unknown> = samanes()): Promise<Org> {
  const created = await call(createElection, { body });
  expect(created.status).toBe(201);
  expect(created.json.status).toBe("draft");
  expect(created.json.organizerToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  const id = created.json.id as string;
  const auth = { authorization: `Bearer ${created.json.organizerToken}` };
  const pub = await call(publish, { params: { id }, headers: auth });
  expect(pub.status).toBe(200);
  expect(pub.json.status).toBe("registration");
  expect(pub.json.manifestHash).toMatch(/^0x[0-9a-f]{64}$/);
  return { id, auth };
}

async function addVoter(org: Org, displayName = "Ana Ejemplo", phoneE164?: string) {
  const r = await call(addVoters, { params: { id: org.id }, headers: org.auth, body: { voters: [{ displayName, phoneE164 }] } });
  expect(r.status).toBe(201);
  return r.json.voters[0] as { id: string; inviteToken: string; inviteUrl: string };
}

async function signBinding(account: ReturnType<typeof privateKeyToAccount>, electionId: string, voterId: string, faceBindingHash: `0x${string}`) {
  return account.signTypedData({ domain: faceBindingDomain(), types: FaceBindingTypes, primaryType: "FaceBinding", message: { electionId, voterId, faceBindingHash, wallet: account.address } });
}

/** Inscripción completa: rostro → wallet (firma FaceBinding) → identidad Semaphore (clave solo en "el navegador" del test). */
async function register(org: Org, seed: number, name = `Vecino ${seed}`) {
  const v = await addVoter(org, name);
  const en = await call(enroll, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
  expect(en.status).toBe(201);
  expect(en.json.faceBindingHash).toMatch(/^0x[0-9a-f]{64}$/);
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await signBinding(account, org.id, v.id, en.json.faceBindingHash);
  const w = await call(linkWallet, { params: { id: v.id }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } });
  expect(w.status).toBe(200);
  expect(w.json.registeredAt).toBeTruthy();
  expect(w.json.phoneE164).toBeUndefined();
  const id = createVoterIdentity();
  const idr = await call(identity, { params: { id: v.id }, body: { inviteToken: v.inviteToken, commitment: id.commitment } });
  expect(idr.status).toBe(201);
  return { ...v, account, identity: id, faceBindingHash: en.json.faceBindingHash as `0x${string}` };
}

async function openIt(org: Org) {
  const o = await call(openRoute, { params: { id: org.id }, headers: org.auth });
  expect(o.status).toBe(200);
  expect(o.json.status).toBe("open");
  expect(o.json.groupRoot).toMatch(/^\d+$/);
  return o.json;
}

async function ballot(electionId: string, privateKey: string, option: number, electionForScope = electionId) {
  const r = await call(roll, { params: { id: electionId } });
  return castBallot(privateKey, r.json.commitments, electionForScope, option, artifactsPaths);
}

describe("Contrato v1 — flujo completo Los Samanes", () => {
  it("registration → open → 5 votos reales → close (verifyPackage real) → draw → audit/verify", async () => {
    const org = await setupRegistration();
    const voters = [];
    for (let i = 0; i < 6; i++) voters.push(await register(org, 100 + i));

    // Lista pública: solo agregados; organizador: lista sin teléfono ni commitment
    const pub = await call(listVoters, { params: { id: org.id } });
    expect(pub.json).toEqual({ counts: { total: 6, invited: 0, registered: 6, withIdentity: 6, voted: 0 } });
    expect(JSON.stringify(pub.json)).not.toContain("Vecino");
    const priv = await call(listVoters, { params: { id: org.id }, headers: org.auth });
    expect(priv.json.voters).toHaveLength(6);
    expect(priv.json.voters[0]).toMatchObject({ state: "registered", hasIdentity: true });
    expect(JSON.stringify(priv.json)).not.toContain(voters[0].identity.commitment);

    const opened = await openIt(org);
    // A2: plantillas faciales borradas al congelar el padrón
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
    const r = await call(roll, { params: { id: org.id } });
    expect(r.json).toMatchObject({ frozen: true, groupRoot: opened.groupRoot, merkleTreeDepth: 10 });
    expect(r.json.commitments).toEqual(voters.map((v) => v.identity.commitment));

    // 5 votos: opciones índice [2,2,1,2,0] → gana "3 proyectos"
    const choices = [2, 2, 1, 2, 0];
    const receipts = [];
    for (let i = 0; i < choices.length; i++) {
      const proof = await ballot(org.id, voters[i].identity.privateKey, choices[i]);
      const res = await call(vote, { params: { id: org.id }, body: { proof } });
      expect(res.status).toBe(201);
      expect(res.json).toMatchObject({ state: "incluido", inclusionId: proof.nullifier, nullifier: proof.nullifier, index: i });
      expect(res.json).not.toHaveProperty("message");
      receipts.push(res.json);
      const m = await call(voted, { params: { id: voters[i].id }, body: { inviteToken: voters[i].inviteToken } });
      expect(m.status).toBe(200);
      if (i < 1) {
        // Con menos de MIN_VOTES_FOR_BREAKDOWN (2) votos no hay desglose; desde ahí se publica por lotes completos.
        const t = await call(tally, { params: { id: org.id } });
        expect(t.json.options.every((o: { count: number | null }) => o.count === null)).toBe(true);
      }
      // C3: con la elección abierta el ledger no publica entradas (ni pruebas ni mensajes)
      const l = await call(ledger, { params: { id: org.id } });
      expect(l.json).toMatchObject({ status: "open", count: i + 1, proofsPublished: false, entries: [] });
      expect(JSON.stringify(l.json)).not.toContain(proof.nullifier);
    }
    const t = await call(tally, { params: { id: org.id } });
    expect(t.json.totalVotes).toBe(5);
    expect(t.json.eligible).toBe(6);
    // En vivo, por lotes completos de MIN_VOTES_FOR_BREAKDOWN (2): con 5 votos se publican los 4 primeros [2,2,1,2]; el 5.º (opción 0) espera.
    expect(t.json.options.map((o: { count: number }) => o.count)).toEqual([0, 1, 3, 0, 0]);

    // Recibo por nullifier
    const rc = await call(receipt, { params: { id: org.id, inclusionId: receipts[1].nullifier } });
    expect(rc.status).toBe(200);
    expect(rc.json).toMatchObject({ index: 1, state: "incluido" });

    // Doble voto: mismo nullifier (prueba nueva de la misma credencial) → 409 already_voted
    const again = await ballot(org.id, voters[0].identity.privateKey, 4);
    const dup = await call(vote, { params: { id: org.id }, body: { proof: again } });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("already_voted");

    // Cierre: paquete + verificador independiente real
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.status).toBe(200);
    expect(closed.json.status).toBe("auditable");
    expect(closed.json.anchor).toBeNull();
    expect(closed.json.packageDigest).toMatch(/^0x[0-9a-f]{64}$/);
    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.auditResult.valid).toBe(true);
    expect(au.json.auditResult.verifierVersion).toMatch(/quorum-verifier/);
    expect(au.json.auditResult.checks.find((c: { name: string }) => c.name === "anchor_matches").reason).toMatch(/no evaluado/);
    expect(au.json.auditResult.checks.find((c: { name: string }) => c.name === "draw_matches").reason).toMatch(/no evaluado/);
    expect(au.json.anchorStatus.mode).toBe("disabled");

    // Ledger completo tras el cierre
    const full = await call(ledger, { params: { id: org.id } });
    expect(full.json.proofsPublished).toBe(true);
    expect(full.json.entries).toHaveLength(5);

    // Paquete: bytes exactos + ETag; sin PII
    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.status).toBe(200);
    expect(art.headers.get("etag")).toBe(`"${closed.json.packageDigest}"`);
    const pkgText = JSON.stringify(art.json);
    for (const v of voters) {
      expect(pkgText).not.toContain(v.id);
      expect(pkgText).not.toContain(v.account.address);
      expect(pkgText).not.toContain(v.faceBindingHash);
    }
    expect(pkgText).not.toContain("Vecino");
    const notModified = await call(artifacts, { params: { id: org.id }, headers: { "if-none-match": `"${closed.json.packageDigest}"` } });
    expect(notModified.status).toBe(304);

    // Sorteo: N = 3 (opción ganadora "3 proyectos"); seed = keccak256(finalHash)
    const d = await call(draw, { params: { id: org.id }, headers: org.auth });
    expect(d.status).toBe(200);
    expect(d.json.status).toBe("drawn");
    expect(d.json.draw.n).toBe(3);
    const g = await call(getDraw, { params: { id: org.id } });
    expect(g.json.winners).toEqual(drawWinners(g.json.candidates, 3, g.json.finalHash).winners);
    expect(g.json.tieBreak).toBe("lowest");
    const au2 = await call(audit, { params: { id: org.id } });
    expect(au2.json.auditResult.valid).toBe(true);
    expect(au2.json.auditResult.checks.find((c: { name: string }) => c.name === "draw_matches")).toMatchObject({ passed: true });

    // Re-verificación pública con el paquete descargado, y con una copia adulterada
    const art2 = await call(artifacts, { params: { id: org.id } });
    const ok = await call(auditVerify, { body: { package: art2.json } });
    expect(ok.status).toBe(200);
    expect(ok.json.valid).toBe(true);
    expect(ok.json.inputArtifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const tampered = structuredClone(art2.json);
    tampered.tally.counts = [0, 0, 0, 0, 5];
    const bad = await call(auditVerify, { body: { package: tampered } });
    expect(bad.json.valid).toBe(false);
    expect(bad.json.checks.filter((c: { passed: boolean }) => !c.passed).map((c: { name: string }) => c.name)).toContain("tally_matches");
    const cheatDraw = structuredClone(art2.json);
    cheatDraw.draw.winners = ["p-01", "p-02", "p-03"].filter((w) => !art2.json.draw.winners.includes(w)).concat(art2.json.draw.winners).slice(0, 3);
    if (JSON.stringify(cheatDraw.draw.winners) !== JSON.stringify(art2.json.draw.winners)) {
      const cd = await call(auditVerify, { body: { package: cheatDraw } });
      expect(cd.json.checks.find((c: { name: string }) => c.name === "draw_matches").passed).toBe(false);
    }
    const junk = await call(auditVerify, { body: { package: { hello: "world" } } });
    expect(junk.json.valid).toBe(false);
    expect(junk.json.checks[0].name).toBe("package_schema");
  }, 120_000);
});

describe("inscripción", () => {
  it("dedupe facial 1:N → 409 duplicate_identity sin guardar nada; dentro de otra elección sí se admite", async () => {
    const org = await setupRegistration();
    const a = await addVoter(org, "A");
    const b = await addVoter(org, "B");
    expect((await call(enroll, { body: { voterId: a.id, inviteToken: a.inviteToken, descriptor: descriptor(5), consent: true } })).status).toBe(201);
    const near = descriptor(5).map((x, i) => (i === 0 ? x + 0.01 : x));
    const dup = await call(enroll, { body: { voterId: b.id, inviteToken: b.inviteToken, descriptor: near, consent: true } });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("duplicate_identity");
    expect(JSON.stringify(dup.json)).not.toMatch(/similar|A\b/);
    expect(await store.getFaceTemplate(b.id)).toBeNull();
    expect((await store.getVoter(b.id))?.faceBindingHash ?? null).toBeNull();
    expect((await call(enroll, { body: { voterId: b.id, inviteToken: b.inviteToken, descriptor: descriptor(6), consent: true } })).status).toBe(201);
    // plantilla cifrada, nunca el descriptor en claro
    const tpl = await store.getFaceTemplate(a.id);
    expect(tpl?.sealed.alg).toBe("aes-256-gcm");
    expect(JSON.stringify(tpl)).not.toContain(String(descriptor(5)[0]));

    const other = await setupRegistration();
    const c = await addVoter(other, "C");
    expect((await call(enroll, { body: { voterId: c.id, inviteToken: c.inviteToken, descriptor: descriptor(5), consent: true } })).status).toBe(201);
  });

  it("dedupe con el descriptor actual (insightface, 256 dims): umbral 0.70; otras dimensiones en la misma elección → rechazo", async () => {
    const org = await setupRegistration();
    const [a, b, c, d] = [await addVoter(org, "A"), await addVoter(org, "B"), await addVoter(org, "C"), await addVoter(org, "D")];
    const base = descriptor(7, 256);
    expect((await call(enroll, { body: { voterId: a.id, inviteToken: a.inviteToken, descriptor: base, consent: true } })).status).toBe(201);
    // Coseno ≈ 0.72 con `base` (≥ 0.70) → mismo rostro; con 1024 dims (faceres) el umbral sería 0.75 y pasaría.
    const other = descriptor(8, 256);
    const mix = (w: number) => base.map((x, i) => x * w + other[i] * Math.sqrt(1 - w * w));
    const dup = await call(enroll, { body: { voterId: b.id, inviteToken: b.inviteToken, descriptor: mix(0.72), consent: true } });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("duplicate_identity");
    expect((await call(enroll, { body: { voterId: b.id, inviteToken: b.inviteToken, descriptor: mix(0.6), consent: true } })).status).toBe(201);
    // Un descriptor de otro modelo (128 o 1024 dims) no se puede comparar: aceptarlo saltaría el dedupe.
    const stale = await call(enroll, { body: { voterId: c.id, inviteToken: c.inviteToken, descriptor: descriptor(7, 1024), consent: true } });
    expect(stale.status).toBe(400);
    expect(stale.json.error).toMatch(/Recarga la página/);
    expect(await store.getFaceTemplate(c.id)).toBeNull();
    // FACE_DEDUPE_THRESHOLD fija el umbral para todos los modelos.
    vi.stubEnv("FACE_DEDUPE_THRESHOLD", "0.5");
    expect((await call(enroll, { body: { voterId: d.id, inviteToken: d.inviteToken, descriptor: mix(0.6), consent: true } })).status).toBe(409);
  });

  it("face/verify (A3): exige inviteToken y responde solo ok/no-ok", async () => {
    const org = await setupRegistration();
    const v = await addVoter(org);
    await call(enroll, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(3), consent: true } });
    const noTok = await call(faceVerify, { body: { voterId: v.id, descriptor: descriptor(3) } });
    expect(noTok.status).toBe(400);
    const wrong = await call(faceVerify, { body: { voterId: v.id, inviteToken: "x", descriptor: descriptor(3) } });
    expect(wrong.status).toBe(403);
    const same = await call(faceVerify, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(3) } });
    expect(same.json).toMatchObject({ ok: true, mode: "demo-liveness" });
    expect(same.json).not.toHaveProperty("similarity");
    expect(same.json).not.toHaveProperty("threshold");
    const rnd = await call(faceVerify, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(99) } });
    expect(rnd.json).toEqual({ ok: false, voteNonce: null, mode: "demo-liveness" });
  });

  it("wallet: exige rostro, firma FaceBinding válida y propia; una wallet por votante y por elección", async () => {
    const org = await setupRegistration();
    const a = await addVoter(org, "A");
    const b = await addVoter(org, "B");
    const acct = privateKeyToAccount(generatePrivateKey());
    const fake = `0x${"11".repeat(32)}` as const;
    const before = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: acct.address, kind: "eoa-demo", bindingSignature: await signBinding(acct, org.id, a.id, fake) } });
    expect(before.status).toBe(403);
    expect(before.json.code).toBe("not_eligible");

    const en = await call(enroll, { body: { voterId: a.id, inviteToken: a.inviteToken, descriptor: descriptor(21), consent: true } });
    const hash = en.json.faceBindingHash as `0x${string}`;
    const other = privateKeyToAccount(generatePrivateKey());
    // firma de otra cuenta, firma sobre otro hash, firma para otro votante
    for (const sig of [await signBinding(other, org.id, a.id, hash), await signBinding(acct, org.id, a.id, fake), await signBinding(acct, org.id, b.id, hash)]) {
      const r = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: acct.address, kind: "eoa-demo", bindingSignature: sig } });
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("forbidden");
    }
    const tok = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: "nope", walletAddress: acct.address, kind: "eoa-demo", bindingSignature: await signBinding(acct, org.id, a.id, hash) } });
    expect(tok.status).toBe(403);
    // kernel sin RPC → 503 honesto
    const kernel = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: acct.address, kind: "kernel", bindingSignature: "0x1234" } });
    expect(kernel.status).toBe(503);
    expect(kernel.json.code).toBe("unavailable");
    const good = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: acct.address, kind: "eoa-demo", bindingSignature: await signBinding(acct, org.id, a.id, hash) } });
    expect(good.status).toBe(200);
    expect(good.json).toMatchObject({ walletAddress: acct.address, walletKind: "eoa-demo", inviteStatus: "claimed" });
    const changeWallet = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: other.address, kind: "eoa-demo", bindingSignature: await signBinding(other, org.id, a.id, hash) } });
    expect(changeWallet.status).toBe(403);

    // B intenta reutilizar la wallet de A
    const enb = await call(enroll, { body: { voterId: b.id, inviteToken: b.inviteToken, descriptor: descriptor(22), consent: true } });
    const reuse = await call(linkWallet, { params: { id: b.id }, body: { inviteToken: b.inviteToken, walletAddress: acct.address, kind: "eoa-demo", bindingSignature: await signBinding(acct, org.id, b.id, enb.json.faceBindingHash) } });
    expect(reuse.status).toBe(403);
    expect(reuse.json.code).toBe("not_eligible");

    // smart wallet (kernel) con verificador RPC inyectado (ERC-1271/6492 simulado, sin red)
    setWalletRpcVerifierForTests(async ({ message, signature }) => message.voterId === b.id && signature === "0xc0ffee");
    const kOk = await call(linkWallet, { params: { id: b.id }, body: { inviteToken: b.inviteToken, walletAddress: other.address, kind: "kernel", bindingSignature: "0xc0ffee" } });
    expect(kOk.status).toBe(200);
    expect(kOk.json.walletKind).toBe("kernel");
  });

  it("identidad: tras la wallet, una sola vez, commitment único, no después de abrir", async () => {
    const org = await setupRegistration();
    const v = await addVoter(org);
    const id1 = createVoterIdentity();
    const early = await call(identity, { params: { id: v.id }, body: { inviteToken: v.inviteToken, commitment: id1.commitment } });
    expect(early.status).toBe(403);
    expect(early.json.code).toBe("not_eligible");
    const r = await register(org, 31);
    const twice = await call(identity, { params: { id: r.id }, body: { inviteToken: r.inviteToken, commitment: createVoterIdentity().commitment } });
    expect(twice.status).toBe(409);
    const r2 = await register(org, 32);
    void r2;
    // commitment ajeno (público en /roll) para un tercero → 409
    const third = await addVoter(org, "T");
    const en = await call(enroll, { body: { voterId: third.id, inviteToken: third.inviteToken, descriptor: descriptor(33), consent: true } });
    const acct = privateKeyToAccount(generatePrivateKey());
    await call(linkWallet, { params: { id: third.id }, body: { inviteToken: third.inviteToken, walletAddress: acct.address, kind: "eoa-demo", bindingSignature: await signBinding(acct, org.id, third.id, en.json.faceBindingHash) } });
    const stolen = await call(identity, { params: { id: third.id }, body: { inviteToken: third.inviteToken, commitment: r.identity.commitment } });
    expect(stolen.status).toBe(409);
    const nonCanonical = await call(identity, { params: { id: third.id }, body: { inviteToken: third.inviteToken, commitment: `0${createVoterIdentity().commitment}` } });
    expect(nonCanonical.status).toBe(400);
    const ok = await call(identity, { params: { id: third.id }, body: { inviteToken: third.inviteToken, commitment: createVoterIdentity().commitment } });
    expect(ok.json).toEqual({ ok: true, registeredCount: 3 });

    await openIt(org);
    const late = await addVoter(org).catch(() => null);
    expect(late).toBeNull();
    const lateCensus = await call(addVoters, { params: { id: org.id }, headers: org.auth, body: { voters: [{ displayName: "x" }] } });
    expect(lateCensus.status).toBe(409);
    const lateEnroll = await call(enroll, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(34), consent: true } });
    expect(lateEnroll.status).toBe(409);
  });

  it("open: padrón vacío → 409; segunda apertura → 409", async () => {
    const org = await setupRegistration();
    const empty = await call(openRoute, { params: { id: org.id }, headers: org.auth });
    expect(empty.status).toBe(409);
    await register(org, 41);
    await openIt(org);
    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(409);
  });
});

describe("voto: rechazos", () => {
  it("fase, codificación (C1/A1), scope ajeno, prueba alterada, fuera de rango, elección cerrada", async () => {
    const org = await setupRegistration();
    const v1 = await register(org, 51);
    const v2 = await register(org, 52);

    // aún en registration
    const commitments = [v1.identity.commitment, v2.identity.commitment];
    const early = await castBallot(v1.identity.privateKey, commitments, org.id, 0, artifactsPaths);
    const e = await call(vote, { params: { id: org.id }, body: { proof: early } });
    expect(e.status).toBe(409);
    expect(e.json.code).toBe("closed");

    await openIt(org);
    const good = await ballot(org.id, v1.identity.privateKey, 1);
    // C1: nullifier no canónico ("0"+n) → 400 en la entrada
    expect((await call(vote, { params: { id: org.id }, body: { proof: { ...good, nullifier: `0${good.nullifier}` } } })).status).toBe(400);
    // A1: message en hex → 400
    expect((await call(vote, { params: { id: org.id }, body: { proof: { ...good, message: "0x1" } } })).status).toBe(400);
    // prueba de otra elección (scope distinto)
    const foreign = await ballot(org.id, v2.identity.privateKey, 1, "otra-eleccion");
    const f = await call(vote, { params: { id: org.id }, body: { proof: foreign } });
    expect(f.status).toBe(403);
    expect(f.json.code).toBe("not_eligible");
    // prueba alterada (mensaje cambiado) → Groth16 no verifica
    const forged: SemaphoreProof = { ...good, message: "0" };
    const fo = await call(vote, { params: { id: org.id }, body: { proof: forged } });
    expect(fo.status).toBe(403);
    expect(fo.json.error).toMatch(/no verifica/);
    // opción fuera de rango (prueba válida para message 7) → 400 sin consumir el nullifier
    const out = await ballot(org.id, v2.identity.privateKey, 7);
    const o = await call(vote, { params: { id: org.id }, body: { proof: out } });
    expect(o.status).toBe(400);
    // los rechazos no consumieron nada: las boletas legítimas entran
    expect((await call(vote, { params: { id: org.id }, body: { proof: good } })).status).toBe(201);
    expect((await call(vote, { params: { id: org.id }, body: { proof: await ballot(org.id, v2.identity.privateKey, 0) } })).status).toBe(201);
    expect((await call(ledger, { params: { id: org.id } })).json.count).toBe(2);

    await call(close, { params: { id: org.id }, headers: org.auth });
    const late = await call(vote, { params: { id: org.id }, body: { proof: good } });
    expect(late.status).toBe(409);
    expect(late.json.code).toBe("closed");
  }, 60_000);

  it("solo ancla on-chain (decisión de José): POST /vote con `onchain` responde 400 onchain_not_supported y no incluye la boleta", async () => {
    vi.stubEnv("NEXT_PUBLIC_REGISTRY_ADDRESS", "0x00000000000000000000000000000000000000aa");
    vi.stubEnv("QUORUM_ONCHAIN_CAST", "true"); // ni siquiera con el flag antiguo
    const org = await setupRegistration();
    const v1 = await register(org, 61);
    await openIt(org);
    const proof = await ballot(org.id, v1.identity.privateKey, 0);
    const r1 = await call(vote, { params: { id: org.id }, body: { proof, onchain: { txHash: `0x${"ab".repeat(32)}` } } });
    expect(r1.status).toBe(400);
    expect(r1.json).toMatchObject({ code: "onchain_not_supported" });
    expect((await call(ledger, { params: { id: org.id } })).json).toMatchObject({ count: 0 });
    // La misma prueba sin `onchain` sí entra (el rechazo no consumió el nullifier).
    const r2 = await call(vote, { params: { id: org.id }, body: { proof } });
    expect(r2.status).toBe(201);
    expect(r2.json).not.toHaveProperty("txHash");
  }, 60_000);
});

describe("cierre: ancla y fallos", () => {
  it("con ORGANIZER_PRIVATE_KEY + RPC (transporte simulado) ancla y el verificador comprueba anchor_matches", async () => {
    vi.stubEnv("NEXT_PUBLIC_REGISTRY_ADDRESS", ""); // sin registro → modo antiguo (calldata)
    const legacyPk = generatePrivateKey();
    vi.stubEnv("ORGANIZER_PRIVATE_KEY", legacyPk);
    vi.stubEnv("BASE_SEPOLIA_RPC", "http://127.0.0.1:1/never-called");
    const org = await setupRegistration();
    const v = await register(org, 71);
    await openIt(org);
    await call(vote, { params: { id: org.id }, body: { proof: await ballot(org.id, v.identity.privateKey, 0) } });
    const txHash = `0x${"a1".repeat(32)}` as const;
    let sent: `0x${string}` = "0x";
    const from = privateKeyToAccount(legacyPk).address;
    setEngineHooksForTests({
      anchorTransport: {
        chainId: async () => 84532,
        sender: () => from,
        send: async (_to, data) => {
          sent = data;
          return txHash;
        },
        getTransaction: async () => ({ from, to: from, input: sent }),
        getReceiptLogs: async () => [],
        call: async () => "0x",
      },
      anchorReader: async (h) => ({ chainId: 84532, from, to: from, input: h === txHash ? sent : "0x" }),
    });
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.json.status).toBe("auditable");
    expect(closed.json.anchor).toEqual({ chainId: 84532, txHash });
    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.anchorStatus.mode).toBe("anchored");
    expect(au.json.auditResult.checks.find((c: { name: string }) => c.name === "anchor_matches")).toMatchObject({ passed: true, status: "verificado" });
    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.json.manifest.anchorPolicy).toEqual({ kind: "calldata", chainId: 84532, organizer: from });
    expect(sent).toBe(encodeAnchorCalldata({ finalHash: art.json.finalHash, groupRoot: art.json.groupRoot, tallyHash: art.json.tallyHash, electionId: org.id }));
  }, 60_000);

  it("con NEXT_PUBLIC_REGISTRY_ADDRESS: manifiesto fija organizador+registro, el cierre llama a QuorumRegistry.anchor y anchor_matches queda verificado", async () => {
    const pk = generatePrivateKey();
    const organizer = privateKeyToAccount(pk).address;
    const registry = getAddress("0x64e7cbf3b1a334a6633f0025d289335aeda8be13");
    vi.stubEnv("ORGANIZER_PRIVATE_KEY", pk);
    vi.stubEnv("BASE_SEPOLIA_RPC", "http://127.0.0.1:1/never-called");
    vi.stubEnv("NEXT_PUBLIC_REGISTRY_ADDRESS", registry);
    const org = await setupRegistration();
    const v = await register(org, 72);
    await openIt(org);
    await call(vote, { params: { id: org.id }, body: { proof: await ballot(org.id, v.identity.privateKey, 1) } });
    const txHash = `0x${"b3".repeat(32)}` as const;
    let sent: { to: string; data: Hex } | null = null;
    let logs: { address: `0x${string}`; data: Hex; topics: Hex[] }[] = [];
    setEngineHooksForTests({
      anchorTransport: {
        chainId: async () => 84532,
        sender: () => organizer,
        send: async (to, data) => {
          sent = { to, data };
          const { args } = decodeFunctionData({ abi: registryAbi, data });
          const [eid, fh] = args as [Hex, Hex];
          logs = [{ address: registry, topics: encodeEventTopics({ abi: registryAbi, eventName: "Anchored", args: { electionId: eid, organizer } }) as Hex[], data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [fh, BigInt(0)]) }];
          return txHash;
        },
        getTransaction: async () => ({ from: organizer, to: registry, input: sent!.data }),
        getReceiptLogs: async () => logs,
        call: async () => "0x",
      },
      anchorReader: async (h) => {
        if (h !== txHash) throw new Error("tx not found");
        return { chainId: 84532, from: organizer, to: registry, input: sent!.data, status: "success", logs };
      },
    });
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.json.status).toBe("auditable");
    expect(closed.json.anchor).toEqual({ chainId: 84532, txHash, registryAddress: registry });
    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.json.manifest.anchorPolicy).toEqual({ kind: "quorum-registry", chainId: 84532, registryAddress: registry, organizer });
    expect(sent).toEqual({ to: registry, data: encodeAnchor(org.id, art.json.finalHash) });
    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.anchorStatus.mode).toBe("anchored");
    expect(au.json.auditResult.checks.find((c: { name: string }) => c.name === "anchor_matches")).toMatchObject({ passed: true, status: "verificado" });

    // Paquete alterado (finalHash) subido a /api/audit/verify → fallo detectado contra el ancla.
    const tampered = { ...art.json, finalHash: `0x${"ee".repeat(32)}` };
    const vr = await call(auditVerify, { body: { package: tampered } });
    const anchorCheck = vr.json.checks.find((c: { name: string }) => c.name === "anchor_matches");
    expect(vr.json.valid).toBe(false);
    expect(anchorCheck).toMatchObject({ passed: false, status: "fallo detectado" });
    expect(anchorCheck.reason).toMatch(/hash final ≠ ancla/);
  }, 60_000);

  it("con registro pero el ancla falla (sin fondos / revert): cierre honesto con anchor=null y anchor_matches no evaluado", async () => {
    const pk = generatePrivateKey();
    vi.stubEnv("ORGANIZER_PRIVATE_KEY", pk);
    vi.stubEnv("BASE_SEPOLIA_RPC", "http://127.0.0.1:1/never-called");
    vi.stubEnv("NEXT_PUBLIC_REGISTRY_ADDRESS", "0x64e7cbf3b1a334a6633f0025d289335aeda8be13");
    const org = await setupRegistration();
    const v = await register(org, 73);
    await openIt(org);
    await call(vote, { params: { id: org.id }, body: { proof: await ballot(org.id, v.identity.privateKey, 0) } });
    setEngineHooksForTests({
      anchorTransport: {
        chainId: async () => 84532,
        sender: () => privateKeyToAccount(pk).address,
        send: async () => {
          throw new Error("insufficient funds for gas * price + value");
        },
        getTransaction: async () => { throw new Error("unused"); },
        getReceiptLogs: async () => [],
        call: async () => "0x",
      },
    });
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.json.anchor).toBeNull();
    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.anchorStatus.mode).toBe("error");
    expect(au.json.anchorStatus.reason).toMatch(/QuorumRegistry: insufficient funds/);
    expect(au.json.auditResult.checks.find((c: { name: string }) => c.name === "anchor_matches")).toMatchObject({ status: "no evaluado" });
  }, 60_000);

  it("si el ledger guardado se altera, el cierre queda `failed` y el AuditResult se publica igual", async () => {
    const org = await setupRegistration();
    const v = await register(org, 81);
    await openIt(org);
    await call(vote, { params: { id: org.id }, body: { proof: await ballot(org.id, v.identity.privateKey, 1) } });
    const eng = await store.getEngine(org.id);
    (eng!.ledger!.entries[0] as BallotEntry).proof.message = "0"; // el organizador "corrige" el voto en su base
    await store.putEngine(eng!);
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.json.status).toBe("failed");
    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.auditResult.valid).toBe(false);
    expect(au.json.auditResult.checks.filter((c: { passed: boolean }) => !c.passed).map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(["chain_integrity", "proofs_valid"]));
    const d = await call(draw, { params: { id: org.id }, headers: org.auth });
    expect(d.status).toBe(409);
  }, 60_000);

  it("draw antes de auditable → 409; elección sin regla de sorteo → 409", async () => {
    const org = await setupRegistration();
    expect((await call(draw, { params: { id: org.id }, headers: org.auth })).status).toBe(409);
    const { candidates: _c, optionValues: _o, winnersCountFromResult: _w, ...plain } = samanes();
    void _c; void _o; void _w;
    const org2 = await setupRegistration(plain);
    const v = await register(org2, 91);
    await openIt(org2);
    await call(vote, { params: { id: org2.id }, body: { proof: await ballot(org2.id, v.identity.privateKey, 0) } });
    await call(close, { params: { id: org2.id }, headers: org2.auth });
    const d = await call(draw, { params: { id: org2.id }, headers: org2.auth });
    expect(d.status).toBe(409);
    expect(d.json.error).toMatch(/no declara sorteo/);
  }, 60_000);
});

describe("autorización del organizador (C4/A7)", () => {
  it("sin token o con el token de otra elección → 401 en publish, voters, invites, open, close, draw", async () => {
    const created = await call(createElection, { body: samanes() });
    const id = created.json.id as string;
    const otherTok = (await call(createElection, { body: samanes() })).json.organizerToken as string;
    for (const headers of [{}, { authorization: `Bearer ${otherTok}` }, { authorization: "Basic abc" }] as Record<string, string>[]) {
      expect((await call(publish, { params: { id }, headers })).status).toBe(401);
      expect((await call(addVoters, { params: { id }, headers, body: { voters: [{ displayName: "x" }] } })).status).toBe(401);
      expect((await call(invites, { params: { id }, headers, body: { electionId: id, voterIds: ["v"], channel: "dry-run" } })).status).toBe(401);
      expect((await call(openRoute, { params: { id }, headers })).status).toBe(401);
      expect((await call(close, { params: { id }, headers })).status).toBe(401);
      expect((await call(draw, { params: { id }, headers })).status).toBe(401);
      const lv = await call(listVoters, { params: { id }, headers });
      expect(lv.json).not.toHaveProperty("voters");
    }
    // el token se guarda como hash, nunca en claro, y GET /elections/:id no lo expone
    expect(JSON.stringify(await call(getElection, { params: { id } }))).not.toContain(created.json.organizerToken);
    expect(await store.getOrganizerTokenHash(id)).not.toBe(created.json.organizerToken);
  });

  it("invitaciones dry-run e invite/:token sin teléfono", async () => {
    const org = await setupRegistration();
    const v = await addVoter(org, "Ana", "+584121234567");
    const inv = await call(invites, { params: { id: org.id }, headers: org.auth, body: { electionId: org.id, voterIds: [v.id], channel: "dry-run" } });
    expect(inv.status).toBe(200);
    expect(inv.json.channel).toBe("dry-run");
    const byToken = await call(invite, { params: { token: v.inviteToken } });
    expect(byToken.json.voter.id).toBe(v.id);
    expect(JSON.stringify(byToken.json)).not.toContain("+58412");
  });

  it("valida inputs y devuelve ApiError", async () => {
    const bad = await call(createElection, { body: { title: "x", kind: "multiple", options: [], startsAt: "no", endsAt: "no" } });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("invalid_input");
    const noValues = await call(createElection, { body: { ...samanes(), optionValues: [1, 2] } });
    expect(noValues.status).toBe(400);
    const nf = await call(getElection, { params: { id: "el_nope" } });
    expect(nf.status).toBe(404);
    expect((await call(createElection, { rawBody: "{{" })).status).toBe(400);
  });
});
