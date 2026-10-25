import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * QA del modo continuo (D-22) para el evento en vivo — casos límite contra el SERVIDOR REAL (`next start`, DATA_DIR
 * temporal, sin claves on-chain, sin mocks: pruebas Semaphore reales en cada navegador y verificador real).
 *  1. Recargar en el aviso de K y después de «¡Listo!» → vuelve a la boleta (no repite la inscripción).
 *  2. El mismo votante vota desde dos pestañas a la vez → una «Tu voto fue contado», la otra «Ya votaste».
 *  3. Recargar después de votar → comprobante.
 *  4. Cierre con gente a medio inscribir: rostro en vuelo → «La votación terminó: ya no se puede inscribir.»; quien
 *     está en /j sin haber tocado «Continuar» → la sala ya cerró.
 *  5. Tras cerrar: «Verificar ahora» en el navegador y «¿Está mi voto?» con el comprobante guardado.
 *  6. Laboratorio del jurado con el paquete continuo publicado: raíz inventada, groupSize falso e inflar el resultado.
 */
const TITLE = "Casos límite E2E (ficticio): ¿qué merienda pedimos?";

async function phone(browser: Browser) {
  return browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "es-VE" });
}

type Person = { ctx: BrowserContext; p: Page; token: string };

async function enter(browser: Browser, code: string, alias: string): Promise<Person> {
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto(`/j/${code}`);
  await p.getByLabel("Tu nombre o apodo").fill(alias);
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.waitForURL(/\/v\/[^/]+$/);
  await expect(p.getByTestId("enrolled-banner")).toContainText("¡Listo! Ya estás inscrito.", { timeout: 90_000 });
  return { ctx, p, token: p.url().split("/v/")[1] };
}

test("modo continuo real · casos límite: recargas, dos pestañas, cierre a medio inscribir, «Mi voto está» y laboratorio", async ({ browser, request }) => {
  test.setTimeout(600_000);
  const now = Date.now();
  const created = await request.post("/api/elections", {
    data: {
      title: TITLE,
      description: "Prueba automatizada. Datos ficticios.",
      kind: "multiple",
      options: [
        { id: "a", label: "Arepas" },
        { id: "b", label: "Empanadas" },
      ],
      minAnonymitySet: 2,
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const { id, organizerToken } = (await created.json()) as { id: string; organizerToken: string };
  const auth = { Authorization: `Bearer ${organizerToken}` };
  expect(((await (await request.post(`/api/elections/${id}/publish`, { headers: auth })).json()) as { status: string }).status).toBe("open");
  const room = (await (await request.post(`/api/elections/${id}/room`, { headers: auth, data: { maxSeats: 50, expiresInMin: 60 } })).json()) as { roomCode: string };
  const code = room.roomCode;

  // ---------- 1. Recargar en el aviso de K: sigue inscrita y sigue esperando ----------
  const ana = await enter(browser, code, "Ana QA");
  await expect(ana.p.getByTestId("anonymity-gate-text")).toHaveText("Tu voto se habilita cuando haya 2 personas inscritas (ahora 1)", { timeout: 15_000 });
  await ana.p.reload();
  await expect(ana.p.getByTestId("enrolled-banner")).toBeVisible({ timeout: 30_000 });
  await expect(ana.p.getByTestId("anonymity-gate-text")).toHaveText(/ahora 1\)$/, { timeout: 15_000 });

  const beto = await enter(browser, code, "Beto QA");
  await expect(beto.p.getByRole("radio")).toHaveCount(2, { timeout: 15_000 });
  // A Ana le aparece sola (dejó la boleta abierta antes de K)
  await expect(ana.p.getByRole("radio")).toHaveCount(2, { timeout: 15_000 });
  // Recargar entre «¡Listo!» y votar → vuelve a la boleta (sin repetir rostro ni vinculación)
  await ana.p.reload();
  await expect(ana.p.getByTestId("enrolled-banner")).toBeVisible({ timeout: 30_000 });
  await expect(ana.p.getByRole("radio")).toHaveCount(2, { timeout: 15_000 });
  await expect(ana.p.getByTestId("face-capture")).toHaveCount(0);
  expect((await (await request.get(`/api/elections/${id}/group`)).json()).size).toBe(2);

  // ---------- 2. Beto vota desde DOS pestañas a la vez ----------
  const beto2 = await beto.ctx.newPage();
  await beto2.goto(`/v/${beto.token}`);
  await expect(beto2.getByRole("radio")).toHaveCount(2, { timeout: 30_000 });
  await beto.p.getByRole("radio", { name: /Arepas$/ }).click();
  await beto2.getByRole("radio", { name: /Empanadas$/ }).click();
  const statuses: number[] = [];
  for (const pg of [beto.p, beto2]) pg.on("response", (r) => { if (r.request().method() === "POST" && /\/vote$/.test(new URL(r.url()).pathname)) statuses.push(r.status()); });
  await Promise.all([beto.p.getByRole("button", { name: "Votar: Arepas" }).click(), beto2.getByRole("button", { name: "Votar: Empanadas" }).click()]);
  const contado = (pg: Page) => pg.getByRole("heading", { name: "Tu voto fue contado" });
  const yaVotaste = (pg: Page) => pg.getByText("Ya votaste en esta votación.");
  await expect.poll(async () => (await contado(beto.p).count()) + (await contado(beto2).count()), { timeout: 120_000 }).toBe(1);
  await expect.poll(async () => (await yaVotaste(beto.p).count()) + (await yaVotaste(beto2).count()), { timeout: 120_000 }).toBe(1);
  expect(statuses.sort()).toEqual([201, 409]);
  const loser = (await contado(beto.p).count()) ? beto2 : beto.p;
  await loser.getByRole("button", { name: "Ver mi comprobante" }).click();
  await expect(loser.getByTestId("receipt")).toBeVisible();

  // ---------- 3. Recargar después de votar → comprobante ----------
  await beto.p.reload();
  await expect(contado(beto.p)).toBeVisible({ timeout: 30_000 });
  await expect(beto.p.getByRole("radio")).toHaveCount(0);

  await ana.p.getByRole("radio", { name: /Empanadas$/ }).click();
  await ana.p.getByRole("button", { name: "Votar: Empanadas" }).click();
  await expect(contado(ana.p)).toBeVisible({ timeout: 120_000 });

  // ---------- 4. Cierre con gente a medio inscribir ----------
  // Carla ya entró a la sala y está en la cámara: su rostro sale JUSTO cuando el organizador cierra.
  const carlaSeat = (await (await request.post(`/api/rooms/${code}/join`, { data: { displayName: "Carla QA" } })).json()) as { inviteToken: string };
  const carlaCtx = await phone(browser);
  const carla = await carlaCtx.newPage();
  let releaseFace!: () => void;
  const faceHeld = new Promise<void>((r) => (releaseFace = r));
  await carla.route("**/api/face/enroll", async (route) => {
    await faceHeld;
    await route.continue();
  });
  await carla.goto(`/v/${carlaSeat.inviteToken}`);
  await carla.getByRole("button", { name: "Continuar" }).click();
  // Dani abrió el QR y escribió su apodo, pero aún no tocó «Continuar».
  const daniCtx = await phone(browser);
  const dani = await daniCtx.newPage();
  await dani.goto(`/j/${code}`);
  await dani.getByLabel("Tu nombre o apodo").fill("Dani QA");
  await expect.poll(() => carla.evaluate(() => document.querySelector('[data-testid="face-capture"]') !== null), { timeout: 30_000 }).toBe(true);

  const closed = await request.post(`/api/elections/${id}/close`, { headers: auth });
  expect(((await closed.json()) as { status: string }).status).toBe("auditable");
  releaseFace();
  await expect(carla.getByTestId("face-error")).toContainText("La votación terminó: ya no se puede inscribir.", { timeout: 30_000 });
  await dani.getByRole("button", { name: "Continuar" }).click();
  await expect(dani.getByText(/La votación terminó/).first()).toBeVisible({ timeout: 15_000 });
  // Al recargar, Carla ve el cierre (no la cámara)
  await carla.reload();
  await expect(carla.getByRole("heading", { name: "La votación terminó" })).toBeVisible({ timeout: 30_000 });

  // ---------- 5. «Verificar ahora» y «¿Está mi voto?» con el comprobante de este teléfono ----------
  await ana.p.goto(`/e/${encodeURIComponent(id)}`);
  // La verificación arranca sola al abrir Transparencia (ya no hay que pulsar «Verificar ahora»).
  await expect(ana.p.getByTestId("audit-verdict")).toContainText("verificado", { timeout: 120_000 });
  const mine = ana.p.locator("#mi-voto");
  await mine.locator("summary").click();
  await expect(mine.getByText("Tomado del comprobante de este teléfono.")).toBeVisible({ timeout: 15_000 });
  await mine.getByRole("button", { name: "Comprobar" }).click();
  await expect(ana.p.getByTestId("my-vote-result")).toContainText("Tu boleta está en el paquete que verificaste", { timeout: 30_000 });

  // ---------- 6. Laboratorio del jurado con el paquete continuo publicado ----------
  const lab = await (await phone(browser)).newPage();
  await lab.goto(`/audit/lab?id=${encodeURIComponent(id)}`);
  await expect(lab.getByTestId("baseline-status")).toContainText("verificado", { timeout: 60_000 });
  await expect(lab.getByTestId("alt-final-hash")).toBeDisabled();
  for (const [alt, checks] of [["ballot-root", ["root_history", "proofs_valid"]], ["group-size", ["root_history"]], ["tally-inflate", ["tally_matches"]]] as const) {
    await lab.getByTestId(`alt-${alt}`).click();
    const result = lab.getByTestId("lab-result");
    await expect(result).toHaveAttribute("data-alteration", alt, { timeout: 60_000 });
    await expect(result).toHaveAttribute("data-verdict", "detectado", { timeout: 60_000 });
    for (const c of checks) await expect(result.locator(`[data-check="${c}"]`)).toHaveAttribute("data-status", "fallo detectado");
    await expect(lab.getByTestId("verdict-banner")).toHaveAttribute("data-status", "fallo detectado");
  }

  for (const c of [ana.ctx, beto.ctx, carlaCtx, daniCtx, lab.context()]) await c.close();
});
