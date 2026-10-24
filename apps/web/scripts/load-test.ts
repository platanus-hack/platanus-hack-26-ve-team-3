/**
 * Prueba de carga de Quórum contra un despliegue real (SIMULACIÓN: elección ficticia, votantes sintéticos).
 *
 *   pnpm --filter @quorum/web exec tsx --tsconfig tsconfig.json scripts/load-test.ts \
 *     [--base https://quorum-sefw.onrender.com] [--voters 60] [--concurrency 20] [--pollers 20] \
 *     [--out <resultados.json>] [--package-out <paquete.json>] [--no-statics] [--no-xff]
 *
 * Simula una sala de N personas por la API pública (docs/API_CONTRACT.md, v1 + Sala abierta):
 *  1. organizador: crea "Prueba de carga (simulación)", publica, abre sala (maxSeats 80, 15 min);
 *  2. pollers (proyectores/teléfonos) cada 2 s sobre /room, /tally, /voters (conteos) y /e/:id/live durante toda la corrida;
 *  3. estáticos pesados (/models/*, /zk/*) una vez por teléfono, concurrencia C, sin caché;
 *  4. inscripción: join por sala → GET invite → face/enroll (descriptor sintético 1024-d aleatorio, casi ortogonal a los demás)
 *     → wallet (FaceBinding EIP-712 firmado con una EOA efímera, kind eoa-demo) → identity (commitment Semaphore);
 *  5. open → GET /roll → pruebas Semaphore pre-generadas en local (no se mide) → ráfaga POST /vote (todas a la vez)
 *     → 10 reenvíos (doble voto, se espera 409);
 *  6. close (ancla si el servidor tiene clave) → GET /audit → GET /artifacts → verificador CLI local → POST /draw → GET /draw.
 *
 * Rate limit por IP: el servidor limita por `x-forwarded-for` (join 30/min, enroll/wallet/identity/vote 20/min). Los joins
 * se envían primero SIN cabecera propia (como 60 teléfonos detrás del mismo wifi) para medir el efecto real; los rechazados
 * con 429 se reintentan con una `x-forwarded-for` distinta por teléfono (simula IPs distintas). El resto de fases usa una
 * `x-forwarded-for` por teléfono (salvo `--no-xff`), con reintento tras 429 si aun así el servidor limita.
 * Nunca guarda claves fuera del proceso; todo el contenido es ficticio.
 *
 * `--mode continuous` (D-22, «Al instante»): ver `mainContinuous` más abajo. Votación continua (publicar = abrir), N
 * votantes entran por la sala escalonados (`--rate` por segundo, 3 por defecto) SIN `x-forwarded-for` propia (todos
 * por la IP de este equipo, como el wifi del evento) y cada uno vota apenas termina de inscribirse, como el cliente real:
 * GET /group hasta K (aviso de K, cada 3 s) → GET /roll → prueba Semaphore en un worker (fuera del hilo que mide) →
 * espera `--proof-delay-ms` (lo que tarda un teléfono, 3000 por defecto) → POST /vote; `stale_root` → nueva prueba
 * con el grupo nuevo (máx. 2 reintentos, como BallotScreen); `anonymity_pending` → espera 3 s y reintenta; 429 → 5 s.
 * Mientras, `--pollers` proyectores consultan /room + /tally cada 2 s y la elección cada 4 s (como Projector.tsx).
 * Luego cierre (ancla real si el servidor tiene clave), verificador CLI con `--anchor-rpc` y sorteo.
 */
import { execFile, fork } from "node:child_process";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { FaceBindingDomain, FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = opt("base", "https://quorum-sefw.onrender.com").replace(/\/$/, "");
const N = Number(opt("voters", "60"));
const C = Number(opt("concurrency", "20"));
const POLLERS = Number(opt("pollers", "20"));
const CHAIN_ID = Number(opt("chain-id", "84532"));
const USE_XFF = !flag("no-xff");
const OUT = opt("out", "");
const PKG_OUT = opt("package-out", "");
const cwd = process.env.INIT_CWD ?? process.cwd();
const MODE = opt("mode", "phased");
const RATE = Number(opt("rate", "3"));
const PROOF_DELAY_MS = Number(opt("proof-delay-ms", "3000"));
const ANCHOR_RPC = opt("anchor-rpc", "");

const STATICS = [
  "/models/blazeface.json", "/models/blazeface.bin", "/models/facemesh.json", "/models/facemesh.bin",
  "/models/faceres.json", "/models/faceres.bin", "/models/liveness.json", "/models/liveness.bin",
  "/models/antispoof.json", "/models/antispoof.bin", "/zk/semaphore-10.wasm", "/zk/semaphore-10.zkey",
];

// ---------------------------------------------------------------------------------------------- métricas
type Sample = { label: string; ms: number; status: number; err?: string; ttfbMs?: number; bytes?: number; t: number };
const samples: Sample[] = [];
const T0 = performance.now();
const log = (...a: unknown[]) => console.log(`[${((performance.now() - T0) / 1000).toFixed(1).padStart(6)} s]`, ...a);

type Res = { status: number; body: unknown; text: string; ms: number };
async function call(label: string, path: string, init: RequestInit & { xff?: string; timeoutMs?: number; token?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers["content-type"] = "application/json";
  if (init.xff && USE_XFF) headers["x-forwarded-for"] = init.xff;
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { ...init, headers, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000), cache: "no-store" });
    const text = await r.text();
    const ms = performance.now() - t;
    samples.push({ label, ms, status: r.status, t: t - T0 });
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, body, text, ms };
  } catch (e) {
    const ms = performance.now() - t;
    const err = (e as Error).name === "TimeoutError" ? "timeout" : `net:${(e as Error).message}`;
    samples.push({ label, ms, status: 0, err, t: t - T0 });
    return { status: 0, body: null, text: err, ms };
  }
}

/** Reintenta tras 429 (como una persona que vuelve a tocar el botón): espera 5 s, hasta 70 s en total. */
async function callRetry(label: string, path: string, init: Parameters<typeof call>[2], counters: { r429: number }) {
  const start = performance.now();
  for (;;) {
    const r = await call(label, path, init);
    if (r.status !== 429 || performance.now() - start > 70_000) return r;
    counters.r429 += 1;
    await sleep(5_000);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function pct(xs: number[], p: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
async function pool<T, R>(items: T[], c: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(c, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
const must = (r: Res, ok: number[], what: string) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
  return r.body as Record<string, unknown>;
};

/** Descriptor facial sintético: 1024 floats gaussianos normalizados. Dos vectores aleatorios en 1024-d tienen coseno ≈ 0 ± 0,03. */
function syntheticDescriptor(): number[] {
  const v = Array.from({ length: 1024 }, () => {
    const u = (randomInt(1, 2 ** 31) / 2 ** 31), w = randomInt(0, 2 ** 31) / 2 ** 31;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  });
  const n = Math.hypot(...v);
  return v.map((x) => Number((x / n).toFixed(6)));
}
const fakeIp = (i: number) => `100.64.${Math.floor(i / 250)}.${(i % 250) + 1}`; // CGNAT, solo como clave de rate limit

// ---------------------------------------------------------------------------------------------- pollers
let polling = true;
async function poller(i: number, electionId: string) {
  const kinds = [
    { label: "poll GET /api/elections/:id/room", path: `/api/elections/${electionId}/room` },
    { label: "poll GET /api/elections/:id/tally", path: `/api/elections/${electionId}/tally` },
    { label: "poll GET /api/elections/:id/voters (conteos)", path: `/api/elections/${electionId}/voters` },
    { label: "poll GET /e/:id/live (HTML)", path: `/e/${electionId}/live` },
  ];
  const k = kinds[i % kinds.length];
  await sleep(randomInt(0, 2000));
  while (polling) {
    const t = performance.now();
    await call(k.label, k.path, { xff: fakeIp(200 + i) });
    await sleep(Math.max(0, 2000 - (performance.now() - t)));
  }
}

// ---------------------------------------------------------------------------------------------- estáticos
async function downloadStatic(path: string, xff: string) {
  const label = `static ${path.startsWith("/zk") ? "/zk/*" : "/models/*"}`;
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { headers: { "cache-control": "no-cache", pragma: "no-cache", ...(USE_XFF ? { "x-forwarded-for": xff } : {}) }, cache: "no-store", signal: AbortSignal.timeout(180_000) });
    const ttfb = performance.now() - t;
    const buf = await r.arrayBuffer();
    samples.push({ label, ms: performance.now() - t, ttfbMs: ttfb, bytes: buf.byteLength, status: r.status, t: t - T0 });
    return buf.byteLength;
  } catch (e) {
    samples.push({ label, ms: performance.now() - t, status: 0, err: (e as Error).name === "TimeoutError" ? "timeout" : `net:${(e as Error).message}`, t: t - T0 });
    return 0;
  }
}

// ---------------------------------------------------------------------------------------------- main
async function main() {
  const startedAt = new Date();
  log(`base=${BASE} voters=${N} concurrency=${C} pollers=${POLLERS} xff=${USE_XFF}`);
  const health = await call("GET / (HTML)", "/");
  if (health.status !== 200) throw new Error(`El despliegue no responde 200 en / (HTTP ${health.status})`);

  // 1. Organizador ------------------------------------------------------------------------------------
  const now = Date.now();
  const created = must(await call("POST /api/elections", "/api/elections", {
    method: "POST",
    body: JSON.stringify({
      title: "Prueba de carga (simulación)",
      description: "Simulación de carga de Quórum: votantes sintéticos, sin personas reales. Se puede ignorar.",
      kind: "multiple",
      options: [1, 2, 3].map((n) => ({ id: `n${n}`, label: `${n} proyecto${n > 1 ? "s" : ""} (simulación)` })),
      optionValues: [1, 2, 3],
      winnersCountFromResult: true,
      candidates: Array.from({ length: 6 }, (_, i) => ({ id: `p-0${i + 1}`, label: `Proyecto simulado ${i + 1}`, amount: 1000 + i * 100 })),
      votingMode: "phased", // con hora de inicio (el modo continuo es el predeterminado)
      startsAt: new Date(now - 5 * 60_000).toISOString(),
      endsAt: new Date(now + 3 * 3_600_000).toISOString(),
    }),
  }), [201], "crear elección");
  const electionId = created.id as string;
  const token = created.organizerToken as string;
  log(`elección ${electionId}`);
  must(await call("POST /api/elections/:id/publish", `/api/elections/${electionId}/publish`, { method: "POST", token }), [200, 201], "publicar");
  const room = must(await call("POST /api/elections/:id/room", `/api/elections/${electionId}/room`, { method: "POST", token, body: JSON.stringify({ maxSeats: 80, expiresInMin: 15 }) }), [200, 201], "abrir sala");
  const roomCode = room.roomCode as string;
  log(`sala ${roomCode} · ${room.joinUrl}`);

  const pollers = Array.from({ length: POLLERS }, (_, i) => poller(i, electionId));

  // 2a. Estáticos (una vez por teléfono, concurrencia C) -------------------------------------------------
  const phases: Record<string, { ms: number; note?: string }> = {};
  if (!flag("no-statics")) {
    log(`estáticos: ${N} teléfonos × ${STATICS.length} archivos, concurrencia ${C}`);
    const t = performance.now();
    let bytes = 0;
    await pool(Array.from({ length: N }, (_, i) => i), C, async (i) => {
      for (const p of STATICS) {
        const b = await downloadStatic(p, fakeIp(i)); // no `bytes += await …`: entre corrutinas perdería sumas
        bytes += b;
      }
    });
    phases["estáticos (N teléfonos)"] = { ms: performance.now() - t, note: `${(bytes / 1e6).toFixed(1)} MB` };
    log(`estáticos: ${(bytes / 1e6).toFixed(1)} MB en ${((performance.now() - t) / 1000).toFixed(1)} s`);
  }

  // 2b. Inscripción -----------------------------------------------------------------------------------
  type Phone = { i: number; voterId: string; inviteToken: string; privateKey: string; commitment: string };
  const phones: (Phone | null)[] = new Array(N).fill(null);
  const c429 = { join_sharedIp: 0, r429: 0 };
  const errors: string[] = [];
  log(`inscripción: ${N} votantes, concurrencia ${C}`);
  const tEnroll = performance.now();
  await pool(Array.from({ length: N }, (_, i) => i), C, async (i) => {
    try {
      // join: primero SIN x-forwarded-for propia (todos comparten la IP de este equipo = wifi del evento)
      let j = await call("POST /api/rooms/:code/join", `/api/rooms/${roomCode}/join`, { method: "POST", body: JSON.stringify({ displayName: `Simulado ${i + 1}` }) });
      if (j.status === 429) {
        c429.join_sharedIp += 1;
        j = await callRetry("POST /api/rooms/:code/join (reintento IP propia)", `/api/rooms/${roomCode}/join`, { method: "POST", xff: fakeIp(i), body: JSON.stringify({ displayName: `Simulado ${i + 1}` }) }, c429);
      }
      const jb = must(j, [201], `join #${i}`);
      const voterId = jb.voterId as string, inviteToken = jb.inviteToken as string;
      const xff = fakeIp(i);
      await call("GET /v/:token (HTML)", `/v/${inviteToken}`, { xff });
      must(await call("GET /api/invite/:token", `/api/invite/${inviteToken}`, { xff }), [200], `invite #${i}`);
      const enr = must(await callRetry("POST /api/face/enroll", "/api/face/enroll", { method: "POST", xff, body: JSON.stringify({ voterId, inviteToken, descriptor: syntheticDescriptor(), consent: true }) }, c429), [200, 201], `enroll #${i}`);
      const account = privateKeyToAccount(generatePrivateKey());
      const bindingSignature = await account.signTypedData({
        domain: { ...FaceBindingDomain, chainId: CHAIN_ID },
        types: FaceBindingTypes,
        primaryType: "FaceBinding",
        message: { electionId, voterId, faceBindingHash: enr.faceBindingHash as `0x${string}`, wallet: account.address },
      });
      must(await callRetry("POST /api/voters/:id/wallet", `/api/voters/${voterId}/wallet`, { method: "POST", xff, body: JSON.stringify({ inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature }) }, c429), [200, 201], `wallet #${i}`);
      const id = createVoterIdentity();
      must(await callRetry("POST /api/voters/:id/identity", `/api/voters/${voterId}/identity`, { method: "POST", xff, body: JSON.stringify({ inviteToken, commitment: id.commitment }) }, c429), [200, 201], `identity #${i}`);
      phones[i] = { i, voterId, inviteToken, privateKey: id.privateKey, commitment: id.commitment };
    } catch (e) {
      errors.push((e as Error).message);
    }
  });
  phases[`inscripción (${N}: join→enroll→wallet→identity)`] = { ms: performance.now() - tEnroll };
  const enrolled = phones.filter((p): p is Phone => !!p);
  log(`inscritos ${enrolled.length}/${N} en ${((performance.now() - tEnroll) / 1000).toFixed(1)} s · joins 429 con IP compartida: ${c429.join_sharedIp} · reintentos 429: ${c429.r429}`);
  for (const e of errors) log("  error:", e);

  // 3. Abrir votación y pre-generar pruebas -------------------------------------------------------------
  must(await call("POST /api/elections/:id/open", `/api/elections/${electionId}/open`, { method: "POST", token, timeoutMs: 60_000 }), [200, 201], "abrir votación");
  const roll = must(await call("GET /api/elections/:id/roll", `/api/elections/${electionId}/roll`), [200], "roll");
  const commitments = roll.commitments as string[];
  log(`votación abierta · padrón ${commitments.length} · generando ${enrolled.length} pruebas en local (no se mide)…`);
  const tProofs = performance.now();
  const pattern = [1, 2, 1, 0, 2, 1];
  const proofs: unknown[] = [];
  for (const p of enrolled) proofs.push(await castBallot(p.privateKey, commitments, electionId, pattern[p.i % pattern.length], defaultArtifacts()));
  log(`pruebas listas en ${((performance.now() - tProofs) / 1000).toFixed(1)} s (cliente local, fuera de la medición)`);

  // ráfaga de votos: todos a la vez, cada teléfono con su IP
  log(`ráfaga: ${proofs.length} POST /vote simultáneos`);
  const tBurst = performance.now();
  const voteRes = await Promise.all(proofs.map((proof, k) => call("POST /api/elections/:id/vote (ráfaga)", `/api/elections/${electionId}/vote`, { method: "POST", xff: fakeIp(enrolled[k].i), body: JSON.stringify({ proof }), timeoutMs: 120_000 })));
  phases[`ráfaga de votos (${proofs.length} simultáneos)`] = { ms: performance.now() - tBurst };
  const voteStatus = countBy(voteRes.map((r) => r.status));
  log(`ráfaga: ${((performance.now() - tBurst) / 1000).toFixed(2)} s · estados ${JSON.stringify(voteStatus)}`);
  // los 429 (si los hubo) se reintentan para no dejar votos fuera
  for (let k = 0; k < voteRes.length; k++) {
    if (voteRes[k].status === 429) voteRes[k] = await callRetry("POST /api/elections/:id/vote (reintento tras 429)", `/api/elections/${electionId}/vote`, { method: "POST", xff: fakeIp(enrolled[k].i), body: JSON.stringify({ proof: proofs[k] }) }, c429);
  }

  // doble voto: 10 reenvíos desde la IP compartida (sin x-forwarded-for propia)
  const dbl = await Promise.all(proofs.slice(0, 10).map((proof) => call("POST /api/elections/:id/vote (doble voto)", `/api/elections/${electionId}/vote`, { method: "POST", body: JSON.stringify({ proof }) })));
  const dblStatus = countBy(dbl.map((r) => r.status));
  const dblCodes = countBy(dbl.map((r) => String((r.body as { code?: string } | null)?.code ?? r.status)));
  log(`doble voto: estados ${JSON.stringify(dblStatus)} códigos ${JSON.stringify(dblCodes)}`);

  // 4. Cierre, auditoría, verificador CLI, sorteo ---------------------------------------------------------
  const tClose = performance.now();
  const closed = must(await call("POST /api/elections/:id/close", `/api/elections/${electionId}/close`, { method: "POST", token, timeoutMs: 180_000 }), [200], "cerrar");
  phases["cierre (tally + ancla + paquete + verifyPackage en servidor)"] = { ms: performance.now() - tClose, note: `estado ${closed.status}` };
  log(`close → ${closed.status} en ${((performance.now() - tClose) / 1000).toFixed(1)} s · ancla ${JSON.stringify(closed.anchor)}`);
  const audit = must(await call("GET /api/elections/:id/audit", `/api/elections/${electionId}/audit`), [200], "audit") as { auditResult: { valid: boolean; checks: { name: string; status?: string; passed?: boolean }[] }; packageDigest: string; anchorStatus: unknown };
  log(`audit: valid=${audit.auditResult.valid} digest ${audit.packageDigest} ancla ${JSON.stringify(audit.anchorStatus)}`);
  const art = await call("GET /api/elections/:id/artifacts", `/api/elections/${electionId}/artifacts`, { timeoutMs: 60_000 });
  const pkgFile = resolve(cwd, PKG_OUT || `load-test-package-${electionId}.json`);
  writeFileSync(pkgFile, art.text);
  const tCli = performance.now();
  let cli: { code: number; valid?: boolean; checks?: unknown } = { code: -1 };
  try {
    const { stdout } = await promisify(execFile)("pnpm", ["--filter", "@quorum/verifier", "verify", pkgFile], { cwd: resolve(import.meta.dirname, "../../.."), maxBuffer: 50e6 });
    const j = JSON.parse(stdout.trim().split("\n").pop()!);
    cli = { code: 0, valid: j.valid, checks: j.checks };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    try { const j = JSON.parse(String(err.stdout).trim().split("\n").pop()!); cli = { code: err.code ?? 1, valid: j.valid, checks: j.checks }; } catch { cli = { code: err.code ?? 1 }; }
  }
  phases["verificador CLI local (paquete descargado)"] = { ms: performance.now() - tCli, note: `exit ${cli.code} valid=${cli.valid}` };
  log(`verificador CLI: exit ${cli.code} valid=${cli.valid} (${((performance.now() - tCli) / 1000).toFixed(1)} s) · paquete ${(art.text.length / 1e3).toFixed(0)} kB → ${pkgFile}`);
  let drawn: Record<string, unknown> | null = null;
  if (closed.status === "auditable") {
    must(await call("POST /api/elections/:id/draw", `/api/elections/${electionId}/draw`, { method: "POST", token, timeoutMs: 120_000 }), [200, 201], "sorteo");
    drawn = must(await call("GET /api/elections/:id/draw", `/api/elections/${electionId}/draw`), [200], "draw");
    log(`sorteo: n=${drawn.n} ganadores ${JSON.stringify(drawn.winners)}`);
  }
  const tally = must(await call("GET /api/elections/:id/tally", `/api/elections/${electionId}/tally`), [200], "tally final");

  polling = false;
  await Promise.all(pollers);

  // ---------------------------------------------------------------------------------------------- informe
  const labels = [...new Set(samples.map((s) => s.label))];
  const table = labels.map((label) => {
    const xs = samples.filter((s) => s.label === label);
    const ok = xs.filter((s) => s.status >= 200 && s.status < 400);
    const first = Math.min(...xs.map((s) => s.t)), last = Math.max(...xs.map((s) => s.t + s.ms));
    return {
      label,
      n: xs.length,
      status: countBy(xs.map((s) => (s.err ? s.err : String(s.status)))),
      p50: pct(xs.map((s) => s.ms), 50), p95: pct(xs.map((s) => s.ms), 95), p99: pct(xs.map((s) => s.ms), 99), max: Math.max(...xs.map((s) => s.ms)),
      ttfbP50: xs[0]?.ttfbMs !== undefined ? pct(xs.map((s) => s.ttfbMs ?? NaN), 50) : undefined,
      ttfbP95: xs[0]?.ttfbMs !== undefined ? pct(xs.map((s) => s.ttfbMs ?? NaN), 95) : undefined,
      mb: xs[0]?.bytes !== undefined ? xs.reduce((a, s) => a + (s.bytes ?? 0), 0) / 1e6 : undefined,
      okCount: ok.length,
      rps: xs.length / Math.max(0.001, (last - first) / 1000),
      n5xx: xs.filter((s) => s.status >= 500).length,
      timeouts: xs.filter((s) => s.err === "timeout").length,
    };
  });
  const result = {
    base: BASE, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), electionId, roomCode,
    voters: N, enrolled: enrolled.length, concurrency: C, pollers: POLLERS, xff: USE_XFF,
    joins429SharedIp: c429.join_sharedIp, retries429: c429.r429, enrollErrors: errors,
    voteBurstStatus: voteStatus, doubleVoteStatus: dblStatus, doubleVoteCodes: dblCodes,
    closedStatus: closed.status, anchor: closed.anchor ?? null, anchorStatus: audit.anchorStatus, serverAuditValid: audit.auditResult.valid,
    serverChecks: audit.auditResult.checks.map((c) => `${c.name}:${c.status ?? (c.passed ? "ok" : "fail")}`),
    packageDigest: audit.packageDigest, packageBytes: art.text.length, cliVerifier: cli, draw: drawn, finalTally: tally,
    phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, { s: +(v.ms / 1000).toFixed(2), note: v.note }])),
    table, totalRequests: samples.length,
  };
  console.log("\n" + JSON.stringify(result, null, 2));
  if (OUT) writeFileSync(resolve(cwd, OUT), JSON.stringify({ ...result, samples }, null, 2));
}

// ============================================================================================== modo continuo (D-22)
function statsTable() {
  const labels = [...new Set(samples.map((s) => s.label))];
  return labels.map((label) => {
    const xs = samples.filter((s) => s.label === label);
    const first = Math.min(...xs.map((s) => s.t)), last = Math.max(...xs.map((s) => s.t + s.ms));
    return {
      label, n: xs.length, status: countBy(xs.map((s) => (s.err ? s.err : String(s.status)))),
      p50: pct(xs.map((s) => s.ms), 50), p95: pct(xs.map((s) => s.ms), 95), p99: pct(xs.map((s) => s.ms), 99), max: Math.max(...xs.map((s) => s.ms)),
      rps: xs.length / Math.max(0.001, (last - first) / 1000),
      n5xx: xs.filter((s) => s.status >= 500).length, timeouts: xs.filter((s) => s.err === "timeout").length,
    };
  });
}

/** Pool de procesos hijos para las pruebas Groth16 (el hilo principal solo hace HTTP y mide). */
function proverPool(size: number) {
  const workers = Array.from({ length: size }, () => fork(resolve(import.meta.dirname, "load-test-prover.ts"), [], { execArgv: ["--import", "tsx"], stdio: ["ignore", "inherit", "inherit", "ipc"] }));
  const pending = new Map<number, (r: { proof?: unknown; error?: string; ms: number }) => void>();
  for (const w of workers) w.on("message", (m: { id: number; proof?: unknown; error?: string; ms: number }) => { pending.get(m.id)?.(m); pending.delete(m.id); });
  let seq = 0;
  const queue: (() => void)[] = [];
  const idle = [...workers];
  const run = (msg: Record<string, unknown>) => new Promise<{ proof?: unknown; error?: string; ms: number }>((res) => {
    const go = () => {
      const w = idle.pop()!;
      const id = ++seq;
      pending.set(id, (r) => { idle.push(w); queue.shift()?.(); res(r); });
      w.send({ ...msg, id });
    };
    if (idle.length) go(); else queue.push(go);
  });
  return { run, close: async () => { for (const w of workers) w.kill(); } };
}

async function mainContinuous() {
  const startedAt = new Date();
  log(`MODO CONTINUO · base=${BASE} voters=${N} rate=${RATE}/s pollers=${POLLERS} proofDelay=${PROOF_DELAY_MS} ms · sin x-forwarded-for propia (IP compartida)`);
  const health = await call("GET / (HTML)", "/");
  if (health.status !== 200) throw new Error(`El despliegue no responde 200 en / (HTTP ${health.status})`);
  const prover = proverPool(Number(opt("provers", "4")));
  // Calentar los workers (carga de artefactos) fuera de la medición.
  { const w = createVoterIdentity(); await Promise.all(Array.from({ length: 4 }, () => prover.run({ privateKey: w.privateKey, commitments: [w.commitment], electionId: "warmup", option: 0 }))); }

  // 1. Organizador: crear (sin votingMode = continuo), publicar = abrir, abrir sala como el panel ("Abrir").
  const now = Date.now();
  const created = must(await call("POST /api/elections", "/api/elections", {
    method: "POST",
    body: JSON.stringify({
      title: "Prueba de carga modo continuo (simulación)",
      description: "Simulación de carga de Quórum en modo continuo: votantes sintéticos, sin personas reales. Se puede ignorar.",
      kind: "multiple",
      options: [1, 2, 3].map((n) => ({ id: `n${n}`, label: `${n} proyecto${n > 1 ? "s" : ""} (simulación)` })),
      optionValues: [1, 2, 3],
      winnersCountFromResult: true,
      candidates: Array.from({ length: 6 }, (_, i) => ({ id: `p-0${i + 1}`, label: `Proyecto simulado ${i + 1}`, amount: 1000 + i * 100 })),
      startsAt: new Date(now - 5 * 60_000).toISOString(),
      endsAt: new Date(now + 3 * 3_600_000).toISOString(),
    }),
  }), [201], "crear elección");
  const electionId = created.id as string;
  const token = created.organizerToken as string;
  if (created.votingMode !== "continuous") throw new Error(`se esperaba votingMode continuous, llegó ${created.votingMode}`);
  const pub = must(await call("POST /api/elections/:id/publish", `/api/elections/${electionId}/publish`, { method: "POST", token }), [200, 201], "publicar");
  const K = Number(pub.minAnonymitySet ?? 5);
  const room = must(await call("POST /api/elections/:id/room", `/api/elections/${electionId}/room`, { method: "POST", token, body: JSON.stringify({ maxSeats: 80, expiresInMin: 30 }) }), [200, 201], "abrir sala");
  const roomCode = room.roomCode as string;
  log(`elección ${electionId} · estado ${pub.status} · K=${K} · sala ${roomCode}`);

  // 2. Proyectores: /room + /tally cada 2 s, la elección cada 4 s (Projector.tsx).
  const liveSeries: { t: number; enrolled: number; voted: number }[] = [];
  const projectors = Array.from({ length: POLLERS }, async (_, i) => {
    await sleep(randomInt(0, 2000));
    let tick = 0;
    while (polling) {
      const t = performance.now();
      const reqs = [call("poll GET /api/elections/:id/room", `/api/elections/${electionId}/room`), call("poll GET /api/elections/:id/tally", `/api/elections/${electionId}/tally`)];
      if (tick++ % 2 === 0) reqs.push(call("poll GET /api/elections/:id", `/api/elections/${electionId}`));
      const [, tl] = await Promise.all(reqs);
      if (i === 0 && tl.status === 200) { const b = tl.body as { eligible: number; totalVotes: number }; liveSeries.push({ t: (performance.now() - T0) / 1000, enrolled: b.eligible, voted: b.totalVotes }); }
      await sleep(Math.max(0, 2000 - (performance.now() - t)));
    }
  });

  // 3. Votantes escalonados: entran, se inscriben y votan apenas pueden.
  const sentProofs: unknown[] = [];
  type Person = { i: number; tJoin: number; tEnrolled?: number; tVoted?: number; proofMs: number[]; stale: number; kWaits: number; gatePolls: number; r429: number; voteStatus?: number; error?: string };
  const people: Person[] = [];
  const pattern = [1, 2, 1, 0, 2, 1];
  const tStart = performance.now();
  const retry429 = async (label: string, path: string, init: Parameters<typeof call>[2], p: Person) => {
    for (let k = 0; ; k++) {
      const r = await call(label, path, init);
      if (r.status !== 429 || k >= 14) return r;
      p.r429 += 1;
      await sleep(5_000);
    }
  };
  const voter = async (i: number) => {
    const p: Person = { i, tJoin: performance.now(), proofMs: [], stale: 0, kWaits: 0, gatePolls: 0, r429: 0 };
    people.push(p);
    try {
      const jb = must(await retry429("POST /api/rooms/:code/join", `/api/rooms/${roomCode}/join`, { method: "POST", body: JSON.stringify({ displayName: `Simulado ${i + 1}` }) }, p), [201], `join #${i}`);
      const voterId = jb.voterId as string, inviteToken = jb.inviteToken as string;
      await call("GET /v/:token (HTML)", `/v/${inviteToken}`);
      must(await call("GET /api/invite/:token", `/api/invite/${inviteToken}`), [200], `invite #${i}`);
      const enr = must(await retry429("POST /api/face/enroll", "/api/face/enroll", { method: "POST", body: JSON.stringify({ voterId, inviteToken, descriptor: syntheticDescriptor(), consent: true }) }, p), [200, 201], `enroll #${i}`);
      const account = privateKeyToAccount(generatePrivateKey());
      const bindingSignature = await account.signTypedData({ domain: { ...FaceBindingDomain, chainId: CHAIN_ID }, types: FaceBindingTypes, primaryType: "FaceBinding", message: { electionId, voterId, faceBindingHash: enr.faceBindingHash as `0x${string}`, wallet: account.address } });
      must(await retry429("POST /api/voters/:id/wallet", `/api/voters/${voterId}/wallet`, { method: "POST", body: JSON.stringify({ inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature }) }, p), [200], `wallet #${i}`);
      const id = createVoterIdentity();
      must(await retry429("POST /api/voters/:id/identity", `/api/voters/${voterId}/identity`, { method: "POST", body: JSON.stringify({ inviteToken, commitment: id.commitment }) }, p), [201], `identity #${i}`);
      p.tEnrolled = performance.now();
      // Aviso de K (AnonymityGate): GET /group cada 3 s hasta tener K inscritos.
      for (;;) {
        const g = must(await call("GET /api/elections/:id/group (aviso K)", `/api/elections/${electionId}/group`), [200], `group #${i}`);
        p.gatePolls += 1;
        if (Number(g.size) >= K) break;
        await sleep(3_000);
      }
      // BallotScreen: GET /roll → prueba → enviar; stale_root → otra vuelta (máx. 2 reintentos).
      for (let attempt = 0; ; attempt++) {
        const roll = must(await call("GET /api/elections/:id/roll", `/api/elections/${electionId}/roll`), [200], `roll #${i}`);
        const pr = await prover.run({ privateKey: id.privateKey, commitments: roll.commitments, electionId, option: pattern[i % pattern.length] });
        if (pr.error) throw new Error(`prueba #${i}: ${pr.error}`);
        p.proofMs.push(pr.ms);
        await sleep(Math.max(0, PROOF_DELAY_MS - pr.ms)); // un teléfono tarda más que este equipo en generar la prueba
        const v = await retry429("POST /api/elections/:id/vote", `/api/elections/${electionId}/vote`, { method: "POST", body: JSON.stringify({ proof: pr.proof }), timeoutMs: 60_000 }, p);
        const code = (v.body as { code?: string } | null)?.code;
        p.voteStatus = v.status;
        if (v.status === 201) { if (sentProofs.length < 5) sentProofs.push(pr.proof); break; }
        if (code === "stale_root" && attempt < 2) { p.stale += 1; continue; }
        if (code === "anonymity_pending" && attempt < 20) { p.kWaits += 1; await sleep(3_000); continue; }
        throw new Error(`vote #${i}: HTTP ${v.status} ${v.text.slice(0, 200)}`);
      }
      p.tVoted = performance.now();
      await retry429("POST /api/voters/:id/voted", `/api/voters/${voterId}/voted`, { method: "POST", body: JSON.stringify({ inviteToken }) }, p);
    } catch (e) {
      p.error = (e as Error).message;
      log("  error:", p.error);
    }
  };
  const voters: Promise<void>[] = [];
  for (let i = 0; i < N; i++) {
    voters.push(voter(i));
    await sleep(1000 / RATE);
  }
  await Promise.all(voters);
  const tAllVoted = performance.now();
  const ok = people.filter((p) => p.tVoted);
  log(`votaron ${ok.length}/${N} en ${((tAllVoted - tStart) / 1000).toFixed(1)} s desde la primera entrada`);
  await sleep(4_000); // que los proyectores vean el último estado antes de cerrar

  // Doble voto: 5 reenvíos simultáneos de pruebas ya incluidas → 409 already_voted.
  const dbl = await Promise.all(sentProofs.map((proof) => call("POST /api/elections/:id/vote (doble voto)", `/api/elections/${electionId}/vote`, { method: "POST", body: JSON.stringify({ proof }) })));
  const dblCodes = countBy(dbl.map((r) => `${r.status} ${String((r.body as { code?: string } | null)?.code ?? "")}`));
  log(`doble voto: ${JSON.stringify(dblCodes)}`);
  const before = must(await call("GET /api/elections/:id/tally", `/api/elections/${electionId}/tally`), [200], "tally antes de cerrar");

  // 4. Cierre, auditoría, verificador CLI (con ancla), sorteo
  const tClose = performance.now();
  const closed = must(await call("POST /api/elections/:id/close", `/api/elections/${electionId}/close`, { method: "POST", token, timeoutMs: 180_000 }), [200], "cerrar");
  const closeMs = performance.now() - tClose;
  log(`close → ${closed.status} en ${(closeMs / 1000).toFixed(1)} s · ancla ${JSON.stringify(closed.anchor)}`);
  const roomAfter = must(await call("GET /api/elections/:id/room (tras cerrar)", `/api/elections/${electionId}/room`), [200], "room tras cerrar");
  const lateJoin = await call("POST /api/rooms/:code/join (tras cerrar)", `/api/rooms/${roomCode}/join`, { method: "POST", body: JSON.stringify({ displayName: "Tarde" }) });
  const audit = must(await call("GET /api/elections/:id/audit", `/api/elections/${electionId}/audit`), [200], "audit") as { auditResult: { valid: boolean; checks: { name: string; passed?: boolean; reason?: string }[] }; packageDigest: string; anchorStatus: unknown };
  log(`audit: valid=${audit.auditResult.valid} ancla ${JSON.stringify(audit.anchorStatus)}`);
  const art = await call("GET /api/elections/:id/artifacts", `/api/elections/${electionId}/artifacts`, { timeoutMs: 60_000 });
  const pkgFile = resolve(cwd, PKG_OUT || `load-test-package-${electionId}.json`);
  writeFileSync(pkgFile, art.text);
  type Cli = { code: number; valid?: boolean; checks?: { name: string; passed?: boolean; reason?: string }[]; ms: number };
  const runCli = async (file: string): Promise<Cli> => {
    const t = performance.now();
    const cliArgs = ["--filter", "@quorum/verifier", "verify", file, ...(ANCHOR_RPC ? ["--anchor-rpc", ANCHOR_RPC] : [])];
    try {
      const { stdout } = await promisify(execFile)("pnpm", cliArgs, { cwd: resolve(import.meta.dirname, "../../.."), maxBuffer: 50e6 });
      const j = JSON.parse(stdout.trim().split("\n").pop()!);
      return { code: 0, valid: j.valid, checks: j.checks, ms: performance.now() - t };
    } catch (e) {
      const err = e as { code?: number; stdout?: string };
      try { const j = JSON.parse(String(err.stdout).trim().split("\n").pop()!); return { code: err.code ?? 1, valid: j.valid, checks: j.checks, ms: performance.now() - t }; } catch { return { code: err.code ?? 1, ms: performance.now() - t }; }
    }
  };
  const cli = await runCli(pkgFile);
  const cliMs = cli.ms;
  log(`verificador CLI (${ANCHOR_RPC ? `--anchor-rpc ${ANCHOR_RPC}` : "sin ancla"}): exit ${cli.code} valid=${cli.valid} en ${(cliMs / 1000).toFixed(1)} s`);
  let drawn: Record<string, unknown> | null = null;
  let drawMs = 0;
  let cliDrawn: Cli | null = null;
  if (closed.status === "auditable") {
    const t = performance.now();
    must(await call("POST /api/elections/:id/draw", `/api/elections/${electionId}/draw`, { method: "POST", token, timeoutMs: 120_000 }), [200, 201], "sorteo");
    drawMs = performance.now() - t;
    drawn = must(await call("GET /api/elections/:id/draw", `/api/elections/${electionId}/draw`), [200], "draw");
    log(`sorteo: n=${drawn.n} ganadores ${JSON.stringify(drawn.winners)}`);
    const art2 = await call("GET /api/elections/:id/artifacts (tras sorteo)", `/api/elections/${electionId}/artifacts`, { timeoutMs: 60_000 });
    const drawnFile = pkgFile.replace(/\.json$/, "") + "-drawn.json";
    writeFileSync(drawnFile, art2.text);
    cliDrawn = await runCli(drawnFile);
    log(`verificador CLI tras sorteo: exit ${cliDrawn.code} valid=${cliDrawn.valid} → ${drawnFile}`);
  }
  const finalTally = must(await call("GET /api/elections/:id/tally", `/api/elections/${electionId}/tally`), [200], "tally final");
  polling = false;
  await Promise.all(projectors);
  await prover.close();

  // ---------------------------------------------------------------------------------------------- informe
  const sec = (ms: number) => +(ms / 1000).toFixed(2);
  const enrollToVote = ok.map((p) => p.tVoted! - p.tEnrolled!);
  const joinToVote = ok.map((p) => p.tVoted! - p.tJoin);
  const joinToEnrolled = people.filter((p) => p.tEnrolled).map((p) => p.tEnrolled! - p.tJoin);
  const pkg = JSON.parse(art.text) as { ledger: { kind: string; groupSize?: number }[] };
  const groupSizes = pkg.ledger.filter((e) => e.kind === "ballot").map((e) => e.groupSize ?? 0);
  const result = {
    mode: "continuous", base: BASE, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), electionId, roomCode, K,
    voters: N, rate: RATE, pollers: POLLERS, proofDelayMs: PROOF_DELAY_MS,
    voted: ok.length, errors: people.filter((p) => p.error).map((p) => `#${p.i}: ${p.error}`),
    staleRoot: people.reduce((a, p) => a + p.stale, 0), votersWithStale: people.filter((p) => p.stale > 0).length,
    anonymityPendingRetries: people.reduce((a, p) => a + p.kWaits, 0), votersWaitedForK: people.filter((p) => p.gatePolls > 1).length,
    retries429: people.reduce((a, p) => a + p.r429, 0),
    proofMsLocal: { p50: pct(people.flatMap((p) => p.proofMs), 50), p95: pct(people.flatMap((p) => p.proofMs), 95) },
    joinToEnrolledS: { p50: sec(pct(joinToEnrolled, 50)), p95: sec(pct(joinToEnrolled, 95)), max: sec(Math.max(...joinToEnrolled)) },
    enrolledToVotedS: { p50: sec(pct(enrollToVote, 50)), p95: sec(pct(enrollToVote, 95)), max: sec(Math.max(...enrollToVote)) },
    joinToVotedS: { p50: sec(pct(joinToVote, 50)), p95: sec(pct(joinToVote, 95)), max: sec(Math.max(...joinToVote)) },
    allVotedS: sec(tAllVoted - tStart),
    tallyBeforeClose: before, closedStatus: closed.status, closeS: sec(closeMs), anchor: closed.anchor ?? null, anchorStatus: audit.anchorStatus,
    roomAfterClose: { open: roomAfter.open, closedReason: roomAfter.closedReason }, lateJoinStatus: lateJoin.status,
    serverAuditValid: audit.auditResult.valid,
    serverChecks: audit.auditResult.checks.map((c) => `${c.name}:${c.passed ? "ok" : "fail"}`),
    serverAnonymity: audit.auditResult.checks.find((c) => c.name === "anonymity_set_min")?.reason,
    groupSizes: { min: Math.min(...groupSizes), median: pct(groupSizes, 50), max: Math.max(...groupSizes), n: groupSizes.length },
    packageDigest: audit.packageDigest, packageBytes: art.text.length,
    cliVerifier: { code: cli.code, valid: cli.valid, s: sec(cliMs), checks: cli.checks?.map((c) => `${c.name}:${c.passed ? "ok" : "fail"} — ${c.reason}`) },
    doubleVote: dblCodes,
    drawS: sec(drawMs), draw: drawn, finalTally,
    cliVerifierAfterDraw: cliDrawn ? { code: cliDrawn.code, valid: cliDrawn.valid, s: sec(cliDrawn.ms), checks: cliDrawn.checks?.filter((c) => /anchor|draw|root_history|anonymity/.test(c.name)).map((c) => `${c.name}:${c.passed ? "ok" : "fail"} — ${c.reason}`) } : null,
    liveSeries: liveSeries.filter((_, k) => k % 3 === 0),
    table: statsTable(), totalRequests: samples.length,
  };
  console.log("\n" + JSON.stringify(result, null, 2));
  if (OUT) writeFileSync(resolve(cwd, OUT), JSON.stringify({ ...result, people, samples }, null, 2));
}

function countBy(xs: (string | number)[]) {
  const o: Record<string, number> = {};
  for (const x of xs) o[String(x)] = (o[String(x)] ?? 0) + 1;
  return o;
}

(MODE === "continuous" ? mainContinuous : main)().then(() => process.exit(0)).catch((e) => {
  polling = false;
  console.error("load-test falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});

