import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Fase 2 · E2E REAL, sin mocks: servidor de producción propio (`playwright.real.config.ts`), store JSON temporal,
 * pruebas Semaphore Groth16 generadas en el navegador, verificador independiente real (servidor y navegador),
 * sorteo recomputado con el adaptador. Sin red: wallet `eoa-demo`, sin ancla (queda "no evaluado" → "no verificable").
 *
 * Datos ficticios: condominio y vecinos inventados, opciones numéricas neutrales.
 */

const TITLE = "Condominio Las Acacias (ficticio): ¿cuántos proyectos vecinales financiamos?";
const VOTERS = ["Vecina Ana (ficticia)", "Vecino Bruno (ficticio)"] as const;
const PROJECTS = ["Huerto comunitario", "Iluminación del estacionamiento", "Pintura de áreas comunes"] as const;

type Voter = { name: string; link: string; context: BrowserContext; page: Page; nullifier?: string };

/** Pulsa la acción de fase del panel y espera a que el SERVIDOR reporte la fase nueva (la línea de tiempo lista todas). */
async function confirmPhase(org: Page, electionId: string, label: string, status: string) {
  await org.getByTestId("phase-action").filter({ hasText: label }).click();
  await org.getByRole("button", { name: new RegExp(`^Sí, ${label}`, "i") }).click();
  await expect
    .poll(async () => (await (await org.request.get(`/api/elections/${encodeURIComponent(electionId)}`)).json()).status, { timeout: 90_000 })
    .toBe(status);
}

async function newVoterPage(browser: Browser, name: string, link: string): Promise<Voter> {
  const context = await browser.newContext({ locale: "es-VE", timezoneId: "America/Caracas" });
  return { name, link, context, page: await context.newPage() };
}

async function register(v: Voter) {
  const { page } = v;
  await page.goto(v.link);
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await page.getByRole("button", { name: "Inscribirme" }).click();
  await page.getByLabel("Nombre").fill(v.name);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /continuar a la prueba de vida/i }).click();
  await page.getByTestId("e2e-fake-face").click();
  // Wallet real de @quorum/wallet en modo eoa-demo (sin NEXT_PUBLIC_ZERODEV_PROJECT_ID), etiquetada como demo.
  await expect(page.getByTestId("wallet-kind")).toContainText(/demo/i);
  await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
  await page.getByRole("button", { name: /enlazar wallet y crear credencial/i }).click();
  await expect(page.getByRole("heading", { name: "Inscripción completa" })).toBeVisible({ timeout: 30_000 });
  // La clave del signer eoa-demo vive en localStorage (sobrevive al cerrar la pestaña) y la credencial está cifrada.
  expect(await page.evaluate(() => localStorage.getItem("quorum.wallet.eoaDemo.v1"))).toMatch(/^0x[0-9a-f]{64}$/);
}

async function vote(v: Voter, option: string) {
  const { page } = v;
  await page.goto(v.link);
  await page.getByRole("button", { name: "Ir a votar" }).click();
  await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
  await page.getByRole("radio", { name: new RegExp(`${option}$`) }).check();
  await page.getByRole("button", { name: /revisar y confirmar/i }).click();
  await page.getByRole("button", { name: /enviar mi voto/i }).click();
}

test("fase 2 real: crear → candidatos → publicar → 2 votantes (rostro, wallet, credencial) → votar con prueba → doble voto rechazado → cerrar → verificar → mi voto está → sorteo recomputado", async ({ browser, page: org, request }) => {
  // ---------- Organizador: crear la votación con el asistente ----------
  await org.goto("/org/new");
  await org.getByLabel("Título de la votación").fill(TITLE);
  await org.locator("#opt-0").fill("1");
  await org.locator("#opt-1").fill("2");
  for (const p of PROJECTS) {
    await org.getByLabel("Proyecto").fill(p);
    await org.getByRole("button", { name: /agregar proyecto/i }).click();
  }
  await org.getByRole("button", { name: "Continuar" }).click();
  await org.getByLabel("Pegar lista (una por línea: Nombre, +58412…)").fill(VOTERS.join("\n"));
  await org.getByRole("button", { name: "Importar lista" }).click();
  await expect(org.getByText(`${VOTERS.length} participantes listos.`)).toBeVisible();
  await org.getByRole("button", { name: "Continuar" }).click();
  await org.getByRole("checkbox").check();
  await org.getByRole("button", { name: /publicar/i }).click();

  // Panel: el organizerToken se muestra UNA vez; lo guardamos.
  await expect(org).toHaveURL(/\/org\/(?!new$)[^/]+$/, { timeout: 30_000 });
  const electionId = decodeURIComponent(new URL(org.url()).pathname.split("/").pop()!);
  const organizerToken = (await org.getByTestId("org-token").textContent())!.trim();
  expect(organizerToken.length).toBeGreaterThanOrEqual(32);
  expect((await (await request.get(`/api/elections/${encodeURIComponent(electionId)}`)).json()).status).toBe("registration");
  await expect(org.getByTestId("candidates-list").first()).toContainText(PROJECTS[0]);

  // Sin token, las acciones del organizador se rechazan (C4).
  expect((await request.post(`/api/elections/${electionId}/open`)).status()).toBe(401);

  // Enlaces de invitación de los 2 votantes (dry-run: nada se envía).
  const list = org.getByTestId("voters-list");
  const links: string[] = [];
  for (const name of VOTERS) {
    const link = await list.locator("li", { hasText: name }).locator("p[title]").getAttribute("title");
    expect(link).toMatch(/\/v\/[^/]+$/);
    links.push(link!);
  }

  // ---------- Votantes: cada uno en su propio navegador ----------
  const voters = [await newVoterPage(browser, VOTERS[0], links[0]), await newVoterPage(browser, VOTERS[1], links[1])];
  for (const v of voters) await register(v);

  // Tras cerrar y reabrir el navegador del votante (misma persistencia), la wallet y la credencial siguen ahí.
  const state = await voters[0].context.storageState();
  await voters[0].context.close();
  voters[0].context = await browser.newContext({ storageState: state, locale: "es-VE", timezoneId: "America/Caracas" });
  voters[0].page = await voters[0].context.newPage();

  // ---------- Organizador: congelar padrón y abrir ----------
  await org.reload();
  await expect(org.getByTestId("voters-list")).toContainText("Inscrito");
  await confirmPhase(org, electionId, "Congelar padrón y abrir votación", "open");

  // ---------- Voto con prueba real (ambos eligen 2) ----------
  const voteBodies: string[] = [];
  voters[0].page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/elections\/[^/]+\/vote$/.test(new URL(r.url()).pathname)) voteBodies.push(r.postData() ?? "");
  });
  for (const v of voters) {
    await vote(v, "2");
    const receipt = v.page.getByTestId("receipt");
    await expect(receipt).toBeVisible({ timeout: 90_000 });
    await expect(receipt).toContainText("incluido");
    v.nullifier = (await v.page.getByTestId("receipt-inclusion-id").textContent())!.trim();
    expect(v.nullifier).toMatch(/^\d+$/);
  }
  expect(voters[0].nullifier).not.toBe(voters[1].nullifier);
  expect(voteBodies).toHaveLength(1);
  expect(Object.keys(JSON.parse(voteBodies[0]))).toEqual(["proof"]);

  // ---------- Doble voto: rechazado ----------
  // (a) Repetir la misma prueba → 409 already_voted.
  const replay = await request.post(`/api/elections/${electionId}/vote`, { data: JSON.parse(voteBodies[0]) });
  expect(replay.status()).toBe(409);
  expect((await replay.json()).code).toBe("already_voted");
  // (b) Aunque se borre el comprobante del navegador, la UI no ofrece votar otra vez: el servidor recuerda "ya votó"
  //     (votedAt, solo la fecha) y la invitación lo muestra.
  await voters[0].page.evaluate((id) => localStorage.removeItem(`quorum.receipt.${id}`), electionId);
  await expect
    .poll(async () => (await (await request.get(new URL(voters[0].link).pathname.replace("/v/", "/api/invite/"))).json()).voter.votedAt, { timeout: 15_000 })
    .toMatch(/T04:00:00\.000Z$/); // inicio del día en Caracas (granularidad de día, AT-10)
  await voters[0].page.goto(voters[0].link);
  await expect(voters[0].page.getByTestId("voted-at")).toContainText("Votaste el");
  await expect(voters[0].page.getByRole("button", { name: "Ir a votar" })).toHaveCount(0);
  // (c) Un campo `onchain` se rechaza (solo ancla on-chain).
  const withOnchain = await request.post(`/api/elections/${electionId}/vote`, { data: { ...JSON.parse(voteBodies[0]), onchain: { txHash: `0x${"ab".repeat(32)}` } } });
  expect(withOnchain.status()).toBe(400);
  expect((await withOnchain.json()).code).toBe("onchain_not_supported");
  const ledgerOpen = await (await request.get(`/api/elections/${electionId}/ledger`)).json();
  expect(ledgerOpen).toMatchObject({ count: 2, proofsPublished: false, entries: [] });

  // ---------- Cerrar: paquete + verificador independiente en el servidor, sin ancla ----------
  await confirmPhase(org, electionId, "Cerrar votación", "auditable");
  const audit = await (await request.get(`/api/elections/${electionId}/audit`)).json();
  expect(audit.auditResult.valid).toBe(true);
  expect(audit.anchorStatus.mode).toBe("disabled");

  // ---------- Verificar ahora (en el navegador del votante) + Mi voto está ----------
  // Navegador de Bruno (conserva su comprobante; el de Ana se borró para el intento de doble voto).
  const vp = voters[1].page;
  await vp.goto(`/e/${encodeURIComponent(electionId)}`);
  await vp.getByRole("button", { name: "Verificar ahora" }).click();
  const verdict = vp.getByTestId("audit-verdict");
  await expect(verdict).toContainText("verificado", { timeout: 90_000 });
  await expect(verdict).toContainText("no verificable"); // ancla no evaluada: nunca verde
  await expect(vp.getByText(/Verificación parcial/)).toBeVisible();
  await expect(vp.getByTestId("verifier-version")).toContainText("quorum-verifier");
  await expect(vp.getByText("Mismo paquete que verificó el servidor")).toBeVisible();
  await expect(vp.getByLabel("Nullifier")).toHaveValue(voters[1].nullifier!);
  await vp.getByRole("button", { name: "Comprobar" }).click();
  await expect(vp.getByTestId("my-vote-result")).toContainText("incluido");
  await expect(vp.getByTestId("my-vote-result")).toContainText("paquete que verificaste");

  // ---------- Sorteo verificable + Recomputar aquí ----------
  await confirmPhase(org, electionId, "Realizar sorteo verificable", "drawn");
  const draw = await (await request.get(`/api/elections/${electionId}/draw`)).json();
  expect(draw.n).toBe(2); // ganó la opción "2" → 2 proyectos
  await vp.goto(`/e/${encodeURIComponent(electionId)}/draw`);
  await expect(vp.getByTestId("draw-winner")).toHaveCount(2, { timeout: 15_000 });
  await vp.getByRole("button", { name: "Recomputar aquí" }).click();
  const recompute = vp.getByTestId("draw-recompute");
  await expect(recompute).toContainText("Coincide", { timeout: 30_000 });
  await expect(recompute).toContainText("(igual a la publicada)");
  await expect(recompute).toContainText("finalHash del paquete de auditoría: coincide");

  for (const v of voters) await v.context.close();
});
