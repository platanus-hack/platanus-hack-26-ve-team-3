/**
 * Flujo crítico P0 contra los route handlers reales (sin servidor HTTP):
 * crear → publicar → censo → invitaciones dry-run → enroll → verify → wallet → voto firmado (EIP-712, EOA viem)
 * → recibo → tally → duplicado rechazado → cerrar → voto en cerrada rechazado → artifacts → audit/verify honesto.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";
import { VoteTypes } from "@quorum/contracts";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { POST as addVoters } from "@/app/api/elections/[id]/voters/route";
import { POST as invites } from "@/app/api/elections/[id]/invites/route";
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as verify } from "@/app/api/face/verify/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { GET as receipt } from "@/app/api/elections/[id]/receipt/[inclusionId]/route";
import { GET as tally } from "@/app/api/elections/[id]/tally/route";
import { GET as layout } from "@/app/api/elections/[id]/layout/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { POST as auditVerify } from "@/app/api/audit/verify/route";
import { voteDomain } from "../vote";
import { call, descriptor, freshStore, sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
});

async function setupOpenElection() {
  const created = await call(createElection, { body: sampleElection() });
  expect(created.status).toBe(201);
  expect(created.json.status).toBe("draft");
  expect(created.json.manifestHash).toBeNull();
  const id = created.json.id as string;
  const published = await call(publish, { params: { id } });
  expect(published.status).toBe(200);
  expect(published.json.status).toBe("open");
  expect(published.json.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  expect(published.json.layout).toBeTruthy();
  return id;
}

async function addVoter(id: string, displayName = "Ana", phoneE164?: string) {
  const r = await call(addVoters, { params: { id }, body: { voters: [{ displayName, phoneE164 }] } });
  expect(r.status).toBe(201);
  const v = r.json.voters[0];
  expect(v.inviteUrl).toBe(`http://localhost:3000/v/${v.inviteToken}`);
  return v as { id: string; inviteToken: string; inviteUrl: string };
}

/** Enroll + verify + wallet; devuelve nonce vigente y cuenta. */
async function readyToVote(id: string, voterId: string, inviteToken: string, seed = 7) {
  const en = await call(enroll, { body: { voterId, inviteToken, descriptor: descriptor(seed), consent: true } });
  expect(en.status).toBe(201);
  expect(en.json.ok).toBe(true);
  const ve = await call(verify, { body: { voterId, descriptor: descriptor(seed) } });
  expect(ve.status).toBe(200);
  expect(ve.json.ok).toBe(true);
  expect(ve.json.mode).toBe("demo-liveness");
  expect(ve.json.voteNonce).toMatch(/^0x[0-9a-f]{64}$/);
  const account = privateKeyToAccount(generatePrivateKey());
  const w = await call(linkWallet, { params: { id: voterId }, body: { inviteToken, walletAddress: account.address } });
  expect(w.status).toBe(200);
  expect(w.json.walletAddress).toBe(account.address);
  expect(w.json.phoneE164).toBeUndefined();
  return { account, nonce: ve.json.voteNonce as `0x${string}` };
}

async function signVote(opts: { id: string; account: ReturnType<typeof privateKeyToAccount>; nonce: `0x${string}`; choice: string; expires?: bigint }) {
  const ballotCommitment = keccak256(toHex(`${opts.choice}:${opts.nonce}`));
  const expires = opts.expires ?? BigInt(Math.floor(Date.now() / 1000) + 120);
  const message = { electionId: opts.id, ballotCommitment, voter: opts.account.address, nonce: opts.nonce, expires };
  const signature = await opts.account.signTypedData({ domain: voteDomain(), types: VoteTypes, primaryType: "Vote", message });
  return { message: { ...message, expires: expires.toString() }, signature, plainChoice: opts.choice };
}

describe("flujo crítico", () => {
  it("crear → publicar → censo → invitaciones dry-run → prueba de vida → wallet → voto → recibo → tally → cierre → auditoría", async () => {
    const id = await setupOpenElection();

    const got = await call(getElection, { params: { id } });
    expect(got.status).toBe(200);
    expect(got.json.id).toBe(id);

    const v = await addVoter(id, "Ana", "+584121234567");
    const inv = await call(invites, { params: { id }, body: { electionId: id, voterIds: [v.id], channel: "dry-run" } });
    expect(inv.status).toBe(200);
    expect(inv.json.channel).toBe("dry-run");
    expect(inv.json.results).toEqual([{ voterId: v.id, status: "sent" }]);

    const byToken = await call(invite, { params: { token: v.inviteToken } });
    expect(byToken.status).toBe(200);
    expect(byToken.json.voter.id).toBe(v.id);
    expect(byToken.json.voter.phoneE164).toBeUndefined();
    expect(JSON.stringify(byToken.json)).not.toContain("+58412");

    const { account, nonce } = await readyToVote(id, v.id, v.inviteToken);
    const signed = await signVote({ id, account, nonce, choice: "sab" });
    const cast = await call(vote, { params: { id }, body: signed });
    expect(cast.status).toBe(201);
    expect(cast.json.state).toBe("recibido");
    expect(cast.json.inclusionId).toMatch(/^[0-9a-f]{64}$/);
    expect(cast.json).not.toHaveProperty("choice");

    // La boleta no guarda voterId; el votante solo guarda votedAt.
    const ballots = await store.listBallots(id);
    expect(ballots).toHaveLength(1);
    expect(ballots[0]).not.toHaveProperty("voterId");
    expect(ballots[0]).not.toHaveProperty("voter");
    const voter = await store.getVoter(v.id);
    expect(voter?.votedAt).toBeTruthy();
    expect(JSON.stringify(voter)).not.toContain('"choice"');

    const rc = await call(receipt, { params: { id, inclusionId: cast.json.inclusionId } });
    expect(rc.status).toBe(200);
    expect(rc.json.inclusionId).toBe(cast.json.inclusionId);
    expect(rc.json).not.toHaveProperty("choice");

    const t1 = await call(tally, { params: { id } });
    expect(t1.status).toBe(200);
    expect(t1.headers.get("cache-control")).toBe("public, s-maxage=2, stale-while-revalidate=5");
    expect(t1.json.totalVotes).toBe(1);
    expect(t1.json.eligible).toBe(1);
    expect(t1.json.turnout).toBe(1);
    expect(t1.json.leadingShare).toBeNull();
    expect(t1.json.options.every((o: { count: number | null }) => o.count === null)).toBe(true);

    // Duplicado: mismo nonce (ya consumido) → already_voted
    const dup = await call(vote, { params: { id }, body: signed });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("already_voted");

    // Duplicado con nonce nuevo (nueva verificación) → el votante ya votó
    const ve2 = await call(verify, { body: { voterId: v.id, descriptor: descriptor(7) } });
    const signed2 = await signVote({ id, account, nonce: ve2.json.voteNonce, choice: "dom" });
    const dup2 = await call(vote, { params: { id }, body: signed2 });
    expect(dup2.status).toBe(409);
    expect(dup2.json.code).toBe("already_voted");

    const lay = await call(layout, { params: { id } });
    expect(lay.status).toBe(200);
    expect(lay.json.tiles.length).toBeGreaterThanOrEqual(2);

    const closed = await call(close, { params: { id } });
    expect(closed.status).toBe(200);
    expect(closed.json.status).toBe("auditable");

    // Censo tras cierre → closed
    const lateCensus = await call(addVoters, { params: { id }, body: { voters: [{ displayName: "x" }] } });
    expect(lateCensus.status).toBe(409);
    expect(lateCensus.json.code).toBe("closed");

    const rcAfter = await call(receipt, { params: { id, inclusionId: cast.json.inclusionId } });
    expect(rcAfter.json.state).toBe("incluido");

    const art = await call(artifacts, { params: { id } });
    expect(art.status).toBe(200);
    expect(art.json.manifestHash).toBe(got.json.manifestHash ?? art.json.manifestHash);
    expect(art.json.ballots).toHaveLength(1);
    expect(art.json.ballots[0]).not.toHaveProperty("voterId");
    expect(art.json.result.counts).toEqual({ sab: 1, dom: 0, mie: 0 });
    expect(JSON.stringify(art.json)).not.toContain("+58412");
    expect(JSON.stringify(art.json)).not.toContain("Ana");

    const audit = await call(auditVerify, { body: { package: art.json } });
    expect(audit.status).toBe(200);
    expect(audit.json.valid).toBe(false);
    expect(audit.json.unsupportedGuarantees).toContain("verifier-not-integrated");
    expect(audit.json.inputArtifactDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.json.electionId).toBe(id);
  });

  it("rechaza voto en elección cerrada", async () => {
    const id = await setupOpenElection();
    const v = await addVoter(id);
    const { account, nonce } = await readyToVote(id, v.id, v.inviteToken);
    const closed = await call(close, { params: { id } });
    expect(closed.json.status).toBe("auditable");
    const signed = await signVote({ id, account, nonce, choice: "sab" });
    const r = await call(vote, { params: { id }, body: signed });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("closed");
  });

  it("rechaza firma inválida, wallet no enlazada y nonce ajeno", async () => {
    const id = await setupOpenElection();
    const v = await addVoter(id);
    const { account, nonce } = await readyToVote(id, v.id, v.inviteToken);

    // Firma de otra cuenta
    const other = privateKeyToAccount(generatePrivateKey());
    const good = await signVote({ id, account, nonce, choice: "sab" });
    const forged = await signVote({ id, account: other, nonce, choice: "sab" });
    const bad = await call(vote, { params: { id }, body: { ...good, signature: forged.signature } });
    expect(bad.status).toBe(403);
    expect(bad.json.code).toBe("forbidden");

    // message.voter de una wallet no enlazada
    const notLinked = await call(vote, { params: { id }, body: { ...forged, message: { ...forged.message } } });
    expect(notLinked.status).toBe(403);
    expect(notLinked.json.code).toBe("not_eligible");

    // Nonce desconocido
    const unknownNonce = await signVote({ id, account, nonce: `0x${"ab".repeat(32)}`, choice: "sab" });
    const un = await call(vote, { params: { id }, body: unknownNonce });
    expect(un.status).toBe(403);
    expect(un.json.code).toBe("not_eligible");

    // Firma expirada
    const expired = await signVote({ id, account, nonce, choice: "sab", expires: BigInt(1) });
    const ex = await call(vote, { params: { id }, body: expired });
    expect(ex.status).toBe(403);

    // plainChoice inválido
    const badChoice = await call(vote, { params: { id }, body: { ...good, plainChoice: "nope" } });
    expect(badChoice.status).toBe(400);

    // El voto correcto sigue siendo válido (ningún rechazo consumió el nonce)
    const ok = await call(vote, { params: { id }, body: good });
    expect(ok.status).toBe(201);
  });

  it("prueba de vida: mismo descriptor pasa, descriptor aleatorio falla y no emite nonce", async () => {
    const id = await setupOpenElection();
    const v = await addVoter(id);
    const en = await call(enroll, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(3), consent: true } });
    expect(en.status).toBe(201);
    const again = await call(enroll, { body: { voterId: v.id, inviteToken: v.inviteToken, descriptor: descriptor(3), consent: true } });
    expect(again.status).toBe(403);
    const wrongToken = await call(enroll, { body: { voterId: v.id, inviteToken: "nope", descriptor: descriptor(3), consent: true } });
    expect(wrongToken.status).toBe(403);

    const same = await call(verify, { body: { voterId: v.id, descriptor: descriptor(3) } });
    expect(same.json.ok).toBe(true);
    expect(same.json.similarity).toBeCloseTo(1, 3);
    expect(same.json.threshold).toBe(0.6);

    const random = await call(verify, { body: { voterId: v.id, descriptor: descriptor(99) } });
    expect(random.status).toBe(200);
    expect(random.json.ok).toBe(false);
    expect(random.json.voteNonce).toBeNull();
    expect(random.json.similarity).toBeLessThan(0.6);

    // Plantilla cifrada: nunca el descriptor en claro
    const tpl = await store.getFaceTemplate(v.id);
    expect(tpl?.sealed.alg).toBe("aes-256-gcm");
    expect(JSON.stringify(tpl)).not.toContain(String(descriptor(3)[0]));
  });

  it("tally desglosa por opción solo con ≥ 5 votos", async () => {
    const id = await setupOpenElection();
    const choices = ["sab", "sab", "dom", "sab", "mie"];
    for (let i = 0; i < choices.length; i++) {
      const v = await addVoter(id, `Votante ${i}`);
      const { account, nonce } = await readyToVote(id, v.id, v.inviteToken, 10 + i);
      const signed = await signVote({ id, account, nonce, choice: choices[i] });
      const r = await call(vote, { params: { id }, body: signed });
      expect(r.status).toBe(201);
      if (i < 4) {
        const t = await call(tally, { params: { id } });
        expect(t.json.options.every((o: { count: number | null }) => o.count === null)).toBe(true);
      }
    }
    const t = await call(tally, { params: { id } });
    expect(t.json.totalVotes).toBe(5);
    expect(t.json.options.map((o: { id: string; count: number }) => [o.id, o.count])).toEqual([["sab", 3], ["dom", 1], ["mie", 1]]);
    expect(t.json.leadingShare).toBeCloseTo(0.6);
  });

  it("valida inputs y devuelve ApiError", async () => {
    const bad = await call(createElection, { body: { title: "x", kind: "multiple", options: [], startsAt: "no", endsAt: "no" } });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("invalid_input");
    const nf = await call(getElection, { params: { id: "el_nope" } });
    expect(nf.status).toBe(404);
    expect(nf.json.code).toBe("not_found");
    const inv = await call(invite, { params: { token: "nope" } });
    expect(inv.status).toBe(404);
    const notJson = await call(createElection, { rawBody: "{{" });
    expect(notJson.status).toBe(400);
  });

  it("wallet: una sola vez y única por elección", async () => {
    const id = await setupOpenElection();
    const a = await addVoter(id, "A");
    const b = await addVoter(id, "B");
    const acct = privateKeyToAccount(generatePrivateKey());
    const first = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: acct.address } });
    expect(first.status).toBe(200);
    const again = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: acct.address } });
    expect(again.status).toBe(200); // idempotente con la misma dirección
    const other = await call(linkWallet, { params: { id: a.id }, body: { inviteToken: a.inviteToken, walletAddress: privateKeyToAccount(generatePrivateKey()).address } });
    expect(other.status).toBe(403);
    const dupWallet = await call(linkWallet, { params: { id: b.id }, body: { inviteToken: b.inviteToken, walletAddress: acct.address } });
    expect(dupWallet.status).toBe(403);
    expect(dupWallet.json.code).toBe("not_eligible");
  });
});
