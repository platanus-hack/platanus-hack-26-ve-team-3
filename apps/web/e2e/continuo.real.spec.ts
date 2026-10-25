import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * D-22 MODO CONTINUO contra el SERVIDOR REAL (`next start`, DATA_DIR temporal, sin claves on-chain). Sin mocks:
 * pruebas Semaphore reales en cada navegador, ledger real con member_added, verificador real.
 *
 * Votación creada SIN votingMode (el predeterminado es «al instante») → publicar = abrir → sala abierta durante la
 * votación → 6 personas entran por /j: las primeras 4 ven el aviso de K=5, al entrar la 5.ª se habilita la boleta para
 * todas; votan mientras la 6.ª sigue entrando → doble voto rechazado → cerrar (sala + votación) → verificador del
 * servidor, CLI y navegador → sorteo verificable.
 * Capturas 360: docs/screenshots/phase2/continuo-*.png.
 */
const TITLE = "Evento de prueba E2E (ficticio): ¿qué charla repetimos?";
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
const REPO = path.resolve(__dirname, "../../..");

type Person = { ctx: BrowserContext; p: Page; alias: string; token: string };

async function phone(browser: Browser) {
  return browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "es-VE" });
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(800); // deja terminar la animación de entrada (q-fade-in)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

/** Entra por la sala con un alias → paso 2 automático (rostro simulado solo en E2E) → inscrito en plena votación. */
async function enter(browser: Browser, code: string, alias: string): Promise<Person> {
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto(`/j/${code}`);
  await expect(p.getByRole("heading", { name: TITLE })).toBeVisible();
  await p.getByLabel("Tu nombre o apodo").fill(alias);
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.waitForURL(/\/v\/[^/]+$/);
  await expect(p.getByTestId("enrolled-banner")).toContainText("¡Listo! Ya estás inscrito.", { timeout: 90_000 });
  return { ctx, p, alias, token: p.url().split("/v/")[1] };
}

async function vote(v: Person, option: string, bodies?: string[]) {
  if (bodies) {
    v.p.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/elections\/[^/]+\/vote$/.test(new URL(r.url()).pathname)) bodies.push(r.postData() ?? "");
    });
  }
  await v.p.getByRole("radio", { name: new RegExp(`${option}$`) }).click();
  await v.p.getByRole("button", { name: `Votar: ${option}` }).click();
  await expect(v.p.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 120_000 });
}

test("modo continuo real: 6 entran por la sala, K=5, votan mientras otros entran, doble voto rechazado, cerrar, verificar (CLI y navegador) y sorteo", async ({ browser, request, baseURL }) => {
  test.setTimeout(600_000);
  const now = Date.now();
  const created = await request.post("/api/elections", {
    data: {
      title: TITLE,
      description: "Prueba automatizada. Datos ficticios.",
      kind: "multiple",
      options: [
        { id: "a", label: "Charla A" },
        { id: "b", label: "Charla B" },
      ],
      candidates: [
        { id: "c-1", label: "Taller 1 (ficticio)" },
        { id: "c-2", label: "Taller 2 (ficticio)" },
        { id: "c-3", label: "Taller 3 (ficticio)" },
      ],
      winnersCount: 1,
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const el = (await created.json()) as { id: string; organizerToken: string; votingMode: string; minAnonymitySet: number };
  expect(el).toMatchObject({ votingMode: "continuous", minAnonymitySet: 5 });
  const { id, organizerToken } = el;
  const auth = { Authorization: `Bearer ${organizerToken}` };

  // ---------- Organizador (360): panel con solo «Abrir» → publica + abre la sala a la vez ----------
  const orgCtx = await phone(browser);
  const org = await orgCtx.newPage();
  await org.addInitScript(([eid, t]) => sessionStorage.setItem(`quorum.orgToken.${eid}`, t), [id, organizerToken] as const);
  await org.goto(`/org/${id}`);
  await org.getByRole("button", { name: "Ya lo guardé" }).click(); // el token no aparece en las capturas
  const card = org.getByTestId("continuous-card");
  await expect(card.getByTestId("phase-action")).toHaveCount(0);
  await card.getByTestId("continuous-open").click();
  await card.getByTestId("continuous-confirm").click();
  await expect(card.getByTestId("room-join-url")).toContainText(`${baseURL}/j/`, { timeout: 30_000 });
  const code = (await card.getByTestId("room-join-url").textContent())!.trim().split("/j/")[1];
  expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  expect((await (await request.get(`/api/elections/${id}`)).json()).status).toBe("open");
  await expect(card.getByTestId("continuous-open")).toHaveCount(0);

  // ---------- Las primeras 4 personas: inscritas, ven el aviso de K (sin boleta) ----------
  const people: Person[] = [];
  for (let i = 0; i < 4; i++) {
    const v = await enter(browser, code, `Persona ${i + 1}`);
    people.push(v);
    await expect(v.p.getByTestId("anonymity-gate-text")).toHaveText(`Tu voto se habilita cuando haya 5 personas inscritas (ahora ${i + 1})`, { timeout: 15_000 });
    await expect(v.p.getByRole("radio")).toHaveCount(0);
  }
  await expect(people[0].p.getByTestId("anonymity-gate-text")).toHaveText("Tu voto se habilita cuando haya 5 personas inscritas (ahora 4)", { timeout: 15_000 });
  await shot(people[3].p, "continuo-aviso-k-360");
  // Antes de K el servidor también rechaza (aunque alguien fuerce el envío): lo cubre el test del backend.

  // ---------- La 5.ª: la boleta aparece de inmediato; a las otras 4 les aparece sola ----------
  people.push(await enter(browser, code, "Persona 5"));
  await expect(people[4].p.getByRole("radio")).toHaveCount(2, { timeout: 15_000 });
  await shot(people[4].p, "continuo-boleta-360");
  for (const v of people.slice(0, 4)) await expect(v.p.getByRole("radio")).toHaveCount(2, { timeout: 15_000 });

  // ---------- Votan 1 y 2 MIENTRAS la 6.ª entra ----------
  const bodies: string[] = [];
  const [sixth] = await Promise.all([enter(browser, code, "Persona 6"), vote(people[0], "Charla A", bodies), vote(people[1], "Charla B")]);
  people.push(sixth);
  await expect(sixth.p.getByRole("radio")).toHaveCount(2, { timeout: 15_000 });
  for (const [i, opt] of [[2, "Charla A"], [3, "Charla A"], [4, "Charla B"], [5, "Charla A"]] as const) await vote(people[i], opt);

  // Panel en vivo (360)
  await expect(card.getByTestId("live-enrolled")).toHaveText("6", { timeout: 15_000 });
  await expect(card.getByTestId("live-voted")).toHaveText("6", { timeout: 15_000 });
  await card.scrollIntoViewIfNeeded();
  await shot(org, "continuo-panel-360");

  // ---------- Doble voto: la misma prueba otra vez → 409 already_voted ----------
  expect(bodies).toHaveLength(1);
  const replay = await request.post(`/api/elections/${id}/vote`, { data: JSON.parse(bodies[0]) });
  expect(replay.status()).toBe(409);
  expect(((await replay.json()) as { code: string }).code).toBe("already_voted");

  // ---------- Cerrar (sala + votación) desde el panel ----------
  await card.getByTestId("continuous-close").click();
  await card.getByTestId("continuous-confirm").click();
  await expect.poll(async () => ((await (await request.get(`/api/elections/${id}`)).json()) as { status: string }).status, { timeout: 120_000 }).toBe("auditable");
  const room = (await (await request.get(`/api/elections/${id}/room`)).json()) as { open: boolean; closedReason: string };
  expect(room).toMatchObject({ open: false, closedReason: "election-closed" });
  const late = await request.post(`/api/rooms/${code}/join`, { data: { displayName: "Tarde" } });
  expect(late.status()).toBe(410);

  // Verificador del servidor
  const audit = (await (await request.get(`/api/elections/${id}/audit`)).json()) as { auditResult: { valid: boolean; checks: { name: string; passed: boolean; reason: string }[]; unsupportedGuarantees: string[] } };
  expect(audit.auditResult.valid).toBe(true);
  const anon = audit.auditResult.checks.find((c) => c.name === "anonymity_set_min")!;
  expect(anon.passed).toBe(true);
  expect(anon.reason).toMatch(/mínimo 5, mediana [56]/);
  expect(audit.auditResult.checks.find((c) => c.name === "root_history")!.passed).toBe(true);
  expect(audit.auditResult.unsupportedGuarantees.join("\n")).toMatch(/correlacion-temporal-en-modo-continuo/);

  // Paquete: 6 member_added + 6 boletas, sin alias ni ids
  const pkgText = await (await request.get(`/api/elections/${id}/artifacts`)).text();
  const pkg = JSON.parse(pkgText) as { ledger: { kind: string; groupSize?: number }[]; tally: { counts: number[]; total: number } };
  expect(pkg.ledger.filter((e) => e.kind === "member_added")).toHaveLength(6);
  expect(pkg.ledger.filter((e) => e.kind === "ballot")).toHaveLength(6);
  expect(pkg.tally).toMatchObject({ counts: [4, 2], total: 6 });
  expect(pkgText).not.toContain("Persona 1");
  for (const v of people) expect(pkgText).not.toContain(v.token);

  // Verificador CLI independiente sobre los bytes descargados
  const file = path.join(mkdtempSync(path.join(tmpdir(), "quorum-continuo-")), "paquete.json");
  writeFileSync(file, pkgText);
  const cli = execFileSync("pnpm", ["--filter", "@quorum/verifier", "verify", file], { cwd: REPO, encoding: "utf8" });
  expect(cli).toMatch(/"valid": ?true/);
  expect(cli).toMatch(/anonymity_set_min/);
  test.info().annotations.push({ type: "cli", description: cli.split("\n").filter((l) => /valid|root_history|anonymity_set_min/.test(l)).join(" | ") });

  // Verificador en el navegador (centro de transparencia) + tamaño del grupo por boleta
  const vp = people[2].p;
  await vp.goto(`/e/${encodeURIComponent(id)}`);
  await expect(vp.getByTestId("anonymity-min")).toHaveText("5", { timeout: 30_000 });
  await vp.getByRole("button", { name: "Verificar ahora" }).click();
  const verdict = vp.getByTestId("audit-verdict");
  await expect(verdict).toContainText("verificado", { timeout: 120_000 });
  await expect(vp.getByText("Mismo paquete que verificó el servidor")).toBeVisible();

  // ---------- Sorteo verificable ----------
  const drawn = await request.post(`/api/elections/${id}/draw`, { headers: auth });
  expect(drawn.ok()).toBe(true);
  expect(((await drawn.json()) as { status: string }).status).toBe("drawn");
  const draw = (await (await request.get(`/api/elections/${id}/draw`)).json()) as { n: number; winners: string[] };
  expect(draw.n).toBe(1);
  expect(draw.winners).toHaveLength(1);
  const audit2 = (await (await request.get(`/api/elections/${id}/audit`)).json()) as { auditResult: { valid: boolean; checks: { name: string; passed: boolean }[] } };
  expect(audit2.auditResult.valid).toBe(true);
  expect(audit2.auditResult.checks.find((c) => c.name === "draw_matches")!.passed).toBe(true);

  for (const v of people) await v.ctx.close();
  await orgCtx.close();
});
