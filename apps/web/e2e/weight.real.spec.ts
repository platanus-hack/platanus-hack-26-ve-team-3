import { writeFileSync } from "node:fs";
import { devices, expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * Peso por teléfono (servidor real, Chromium emulando un Pixel 5, cámara FALSA de Chromium):
 * inscripción con la prueba de vida REAL (Human carga sus modelos y abre la cámara) + voto con prueba Groth16.
 * Suma los bytes transferidos por la red (CDP `encodedDataLength`, lo que de verdad viaja por el wifi), por grupo.
 * La cámara falsa no muestra un rostro: tras medir la carga de Human se comprueba su autoprueba (real/live/descriptor/
 * malla), el dedupe 1:N real con ese descriptor, y se completa la inscripción con "Simular rostro".
 * Escribe el resumen en `QUORUM_WEIGHT_OUT` si está definido.
 */

type Group = "models" | "zk" | "js" | "otros";
const groupOf = (url: string): Group => {
  const p = new URL(url).pathname;
  if (p.startsWith("/models/")) return "models";
  if (p.startsWith("/zk/")) return "zk";
  if (p.endsWith(".js") || p.startsWith("/_next/")) return "js";
  return "otros";
};

async function meter(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const urls = new Map<string, string>();
  const totals: Record<Group, number> = { models: 0, zk: 0, js: 0, otros: 0 };
  const files = new Map<string, number>();
  cdp.on("Network.requestWillBeSent", (e) => urls.set(e.requestId, e.request.url));
  cdp.on("Network.loadingFinished", (e) => {
    const url = urls.get(e.requestId);
    if (!url || url.startsWith("data:")) return;
    totals[groupOf(url)] += e.encodedDataLength;
    const p = new URL(url).pathname;
    if (p.startsWith("/models/") || p.startsWith("/zk/")) files.set(p, (files.get(p) ?? 0) + e.encodedDataLength);
  });
  return { totals, files };
}

const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;

test("peso por teléfono: inscripción (Human real) + voto (Groth16) en un Pixel 5", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const now = Date.now();
  const created = await request.post("/api/elections", {
    data: {
      title: "Medición de peso (ficticia): ¿pintamos el pasillo?",
      description: "Prueba automatizada. Datos ficticios.",
      kind: "yes-no",
      options: [
        { id: "si", label: "Sí" },
        { id: "no", label: "No" },
      ],
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const { id, organizerToken } = (await created.json()) as { id: string; organizerToken: string };
  const auth = { authorization: `Bearer ${organizerToken}` };
  const added = await request.post(`/api/elections/${id}/voters`, {
    headers: auth,
    data: { voters: [{ displayName: "Vecina de prueba (ficticia)" }, { displayName: "Vecino A (ficticio)" }, { displayName: "Vecino B (ficticio)" }] },
  });
  const roster = ((await added.json()) as { voters: { id: string; inviteToken: string; inviteUrl: string }[] }).voters;
  const link = roster[0].inviteUrl;
  expect((await request.post(`/api/elections/${id}/publish`, { headers: auth })).status()).toBe(200);

  const context = await browser.newContext({ ...devices["Pixel 5"], locale: "es-VE", timezoneId: "America/Caracas", permissions: ["camera"] });
  const page = await context.newPage();
  const m = await meter(page);

  // 1) Prueba de vida REAL: Human descarga sus modelos y abre la cámara (falsa).
  await page.goto(link);
  await page.getByRole("button", { name: "Inscribirme" }).click();
  await page.getByLabel("Nombre").fill("Vecina de prueba (ficticia)");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /continuar a la prueba de vida/i }).click();
  await page.getByRole("button", { name: /iniciar prueba de vida/i }).click();
  await expect(page.getByRole("button", { name: /en curso/i })).toBeVisible();
  await expect.poll(() => m.files.has("/models/liveness.bin") && m.files.has("/models/faceres.bin"), { timeout: 120_000 }).toBe(true);
  await page.waitForLoadState("networkidle");
  const modelsLoaded = [...m.files.keys()].filter((f) => f.startsWith("/models/")).sort();

  // 1b) Con la config recortada Human sigue dando antispoof (real), liveness (live), descriptor y malla. Autoprueba con
  //     la imagen de calentamiento que trae Human (ver lib/client/human.ts), expuesta solo en builds de E2E.
  await expect.poll(() => page.evaluate(() => "__quorumHumanSelfTest" in window), { timeout: 120_000 }).toBe(true);
  const st = await page.evaluate(() => (window as unknown as { __quorumHumanSelfTest?: { faces: number; real: number | null; live: number | null; embedding: number[]; meshPoints: number } }).__quorumHumanSelfTest);
  expect(st, "autoprueba de Human").toBeTruthy();
  expect(st!.faces).toBeGreaterThanOrEqual(1);
  expect(st!.real).toEqual(expect.any(Number));
  expect(st!.live).toEqual(expect.any(Number));
  expect(st!.real!).toBeGreaterThanOrEqual(0);
  expect(st!.live!).toBeLessThanOrEqual(1);
  expect(st!.embedding.length).toBeGreaterThanOrEqual(64);
  expect(st!.meshPoints).toBeGreaterThanOrEqual(468); // parpadeo y giro salen de la malla, sin iris

  // 1c) Dedupe 1:N REAL del servidor con un descriptor REAL de Human: el mismo rostro (aunque con ruido) no entra dos veces.
  const enroll = (v: (typeof roster)[number], descriptor: number[]) => request.post("/api/face/enroll", { data: { voterId: v.id, inviteToken: v.inviteToken, descriptor, consent: true } });
  const emb = st!.embedding;
  expect((await enroll(roster[1], emb)).status()).toBe(201);
  const dup = await enroll(roster[2], emb.map((x, i) => x + (i % 2 ? 0.003 : -0.003)));
  expect(dup.status()).toBe(409);
  expect(((await dup.json()) as { code: string }).code).toBe("duplicate_identity");
  // Otro rostro (vector independiente) sí entra.
  let seed = 12345;
  const other = emb.map(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 2 ** 31 - 1));
  expect((await enroll(roster[2], other)).status()).toBe(201);

  // 2) Completar la inscripción (la cámara falsa no tiene rostro) y votar con prueba real.
  await page.goto(link);
  await page.getByRole("button", { name: "Inscribirme" }).click();
  await page.getByLabel("Nombre").fill("Vecina de prueba (ficticia)");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /continuar a la prueba de vida/i }).click();
  await page.getByTestId("e2e-fake-face").click();
  await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
  await page.getByRole("button", { name: /enlazar wallet y crear credencial/i }).click();
  await expect(page.getByRole("heading", { name: "Inscripción completa" })).toBeVisible({ timeout: 30_000 });
  expect((await request.post(`/api/elections/${id}/open`, { headers: auth })).status()).toBe(200);
  await page.goto(link);
  await page.getByRole("button", { name: "Ir a votar" }).click();
  await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
  await page.getByRole("radio", { name: /Sí$/ }).check();
  await page.getByRole("button", { name: /revisar y confirmar/i }).click();
  await page.getByRole("button", { name: /enviar mi voto/i }).click();
  await expect(page.getByTestId("receipt")).toBeVisible({ timeout: 120_000 });
  await page.waitForLoadState("networkidle");

  const total = Object.values(m.totals).reduce((a, b) => a + b, 0);
  const summary = {
    device: "Pixel 5 (Chromium emulado)",
    totalBytes: total,
    byGroup: m.totals,
    files: Object.fromEntries([...m.files.entries()].sort()),
    modelsLoaded,
  };
  console.log(`[peso] total ${mb(total)} · models ${mb(m.totals.models)} · zk ${mb(m.totals.zk)} · js ${mb(m.totals.js)} · otros ${mb(m.totals.otros)}`);
  console.log(`[peso] modelos cargados: ${modelsLoaded.join(", ")}`);
  if (process.env.QUORUM_WEIGHT_OUT) writeFileSync(process.env.QUORUM_WEIGHT_OUT, JSON.stringify(summary, null, 2));
  await context.close();
});
