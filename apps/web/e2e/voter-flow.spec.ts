import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/**
 * E2E del flujo crítico P0 (spec §9):
 *   organizar → publicar → 3 votantes votan desde 3 clientes → cerrar → auditar
 *   → alterar copia del paquete → FALLO DETECTADO → todo accesible desde móvil 360px.
 *
 * Estado: ESQUELETO. Las rutas de UI (`/org/new`, `/v/[token]`, `/e/[id]`, `/audit`) y la API
 * (docs/API_CONTRACT.md) se implementan en otras ramas. Cada paso está marcado `test.fixme`
 * con el código que debe ejecutarse cuando exista la UI: quitar `fixme` y ajustar selectores
 * (preferir `getByRole` / `getByLabel`, nunca clases CSS).
 *
 * Datos: elección ficticia "Condominio Los Samanes — fecha de la asamblea anual" (fixture).
 */

const ELECTION = {
  title: "Condominio Los Samanes — fecha de la asamblea anual",
  options: ["Sábado 14 de marzo, 9:00 a. m.", "Sábado 21 de marzo, 9:00 a. m.", "Domingo 22 de marzo, 10:00 a. m."],
};

const VOTERS = [
  { displayName: "Ana Ejemplo (ficticio)", choice: 0 },
  { displayName: "Bruno Ficticio (ficticio)", choice: 1 },
  { displayName: "Carla Prueba (ficticio)", choice: 0 },
];

type Invite = { voterId: string; inviteUrl: string };

/** Crea y publica la elección vía API (contrato v0) y devuelve id + invitaciones. */
async function seedElection(request: APIRequestContext): Promise<{ electionId: string; invites: Invite[] }> {
  const now = Date.now();
  const created = await request.post("/api/elections", {
    data: {
      title: ELECTION.title,
      description: "Elección ficticia (fixture) para E2E.",
      kind: "multiple",
      options: ELECTION.options.map((label, i) => ({ id: `opt-${i + 1}`, label })),
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 60 * 60_000).toISOString(),
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const election = (await created.json()) as { id: string; status: string };
  expect(election.status).toBe("draft");

  const published = await request.post(`/api/elections/${election.id}/publish`);
  expect(published.ok()).toBe(true);
  const open = (await published.json()) as { status: string; manifestHash: string | null };
  expect(open.status).toBe("open");
  expect(open.manifestHash).toBeTruthy();

  const voters = await request.post(`/api/elections/${election.id}/voters`, {
    data: { voters: VOTERS.map((v) => ({ displayName: v.displayName })) },
  });
  expect(voters.ok()).toBe(true);
  const { voters: list } = (await voters.json()) as { voters: { id: string; inviteUrl: string }[] };
  return { electionId: election.id, invites: list.map((v) => ({ voterId: v.id, inviteUrl: v.inviteUrl })) };
}

/** Flujo del votante en una página: invitación → datos → consentimiento → prueba de vida (demo) → wallet → boleta → recibo. */
async function voteAs(page: Page, invite: Invite, choiceIndex: number): Promise<string> {
  await page.goto(invite.inviteUrl);
  await expect(page.getByRole("heading", { name: ELECTION.title })).toBeVisible();
  await page.getByRole("button", { name: /continuar|empezar/i }).click();
  await page.getByRole("checkbox", { name: /consiento|acepto/i }).check();
  await page.getByRole("button", { name: /prueba de vida|verificar rostro/i }).click();
  await expect(page.getByText(/demo/i).first()).toBeVisible(); // la prueba de vida debe estar etiquetada demo
  await page.getByRole("button", { name: /crear wallet|continuar/i }).click();
  await page.getByRole("radio", { name: ELECTION.options[choiceIndex] }).check();
  await page.getByRole("button", { name: /enviar voto|votar/i }).click();
  const receipt = page.getByTestId("receipt-inclusion-id");
  await expect(receipt).toBeVisible();
  const inclusionId = (await receipt.textContent())?.trim() ?? "";
  expect(inclusionId).not.toBe("");
  // El recibo no revela la opción elegida (regla 3):
  await expect(page.getByTestId("receipt")).not.toContainText(ELECTION.options[choiceIndex]);
  return inclusionId;
}

async function withClients<T>(browser: Browser, n: number, fn: (pages: Page[]) => Promise<T>): Promise<T> {
  const contexts = await Promise.all(Array.from({ length: n }, () => browser.newContext()));
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    return await fn(pages);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
}

test.describe("Flujo crítico P0: organizar → votar ×3 → cerrar → auditar → detectar manipulación", () => {
  test.describe.configure({ mode: "serial" });

  test.fixme("1. el organizador crea la elección en el wizard /org/new sin comandos", async ({ page }) => {
    await page.goto("/org/new");
    await page.getByLabel(/título/i).fill(ELECTION.title);
    for (const [i, label] of ELECTION.options.entries()) {
      await page.getByLabel(new RegExp(`opción ${i + 1}`, "i")).fill(label);
    }
    await page.getByRole("button", { name: /crear/i }).click();
    await expect(page).toHaveURL(/\/org\/[^/]+$/);
    await expect(page.getByText(/borrador|draft/i)).toBeVisible();
  });

  test.fixme("2. publicar fija el manifiesto (hash visible, inmutable después)", async ({ page, request }) => {
    const { electionId } = await seedElection(request);
    await page.goto(`/org/${electionId}`);
    await expect(page.getByTestId("manifest-hash")).toHaveText(/^(sha256:|0x)[0-9a-f]{64}$/);
    // Intento de editar tras publicar debe fallar (403/409 o botón deshabilitado):
    const edit = await request.post(`/api/elections/${electionId}/publish`);
    expect([400, 403, 409]).toContain(edit.status());
  });

  test.fixme("3. tres votantes votan desde tres clientes distintos y reciben recibos sin opción", async ({ browser, request }) => {
    const { electionId, invites } = await seedElection(request);
    const inclusionIds = await withClients(browser, 3, (pages) =>
      Promise.all(pages.map((p, i) => voteAs(p, invites[i]!, VOTERS[i]!.choice))),
    );
    expect(new Set(inclusionIds).size).toBe(3);
    for (const id of inclusionIds) {
      const receipt = await request.get(`/api/elections/${electionId}/receipt/${id}`);
      expect(receipt.ok()).toBe(true);
      const body = await receipt.text();
      for (const label of ELECTION.options) expect(body).not.toContain(label);
    }
  });

  test.fixme("3b. un votante no puede votar dos veces con la misma credencial (según semántica del motor)", async ({ page, request }) => {
    const { invites } = await seedElection(request);
    await voteAs(page, invites[0]!, 0);
    await page.goto(invites[0]!.inviteUrl);
    // Según ADR-001: o se rechaza (already_voted) o se reemplaza el voto. Nunca se cuenta dos veces.
    await expect(page.getByText(/ya votaste|voto registrado|reemplazar/i)).toBeVisible();
  });

  test.fixme("3c. una invitación inexistente no permite votar (no elegible)", async ({ page }) => {
    const res = await page.goto("/v/tok_no_existe_fixture");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("button", { name: /votar/i })).toHaveCount(0);
  });

  test.fixme("4. resultados en vivo muestran solo agregados y nunca 'verificado' antes de auditar", async ({ page, request }) => {
    const { electionId, invites } = await seedElection(request);
    await voteAs(page, invites[0]!, 0);
    await page.goto(`/e/${electionId}/live`);
    await expect(page.getByTestId("live-layout")).toBeVisible();
    await expect(page.getByText(/^verificado$/i)).toHaveCount(0);
    const tally = await (await request.get(`/api/elections/${electionId}/tally`)).json();
    expect(tally.totalVotes).toBeLessThan(5);
    for (const o of tally.options) expect(o.count).toBeNull(); // <5 votos: sin desglose
  });

  test.fixme("5. el organizador cierra y la elección pasa a auditable con paquete descargable", async ({ page, request }) => {
    const { electionId } = await seedElection(request);
    await page.goto(`/org/${electionId}`);
    await page.getByRole("button", { name: /cerrar votación/i }).click();
    await page.getByRole("button", { name: /confirmar/i }).click();
    await expect(page.getByText(/auditable/i)).toBeVisible({ timeout: 20_000 });
    const artifacts = await request.get(`/api/elections/${electionId}/artifacts`);
    expect(artifacts.ok()).toBe(true);
    const pkg = await artifacts.json();
    expect(Object.keys(pkg)).toEqual(expect.arrayContaining(["manifest", "ballots", "result", "versions", "checksums"]));
    expect(JSON.stringify(pkg)).not.toMatch(/displayName|phoneE164|voterId/);
  });

  test.fixme("6. el auditor independiente verifica el paquete original y muestra método, versión y hash", async ({ page, request }) => {
    const { electionId } = await seedElection(request);
    await request.post(`/api/elections/${electionId}/close`);
    await page.goto("/audit");
    await page.getByLabel(/id de elección|paquete/i).fill(electionId);
    await page.getByRole("button", { name: /verificar/i }).click();
    const result = page.getByRole("status");
    await expect(result).toContainText(/verificado|no verificable/i);
    await expect(page.getByTestId("verifier-version")).not.toBeEmpty();
    await expect(page.getByTestId("input-artifact-digest")).toHaveText(/[0-9a-f]{64}/);
  });

  test.fixme("7. alterar una copia del paquete produce FALLO DETECTADO en segundos; el original sigue intacto", async ({ page, request }) => {
    const { electionId } = await seedElection(request);
    await request.post(`/api/elections/${electionId}/close`);
    const original = await (await request.get(`/api/elections/${electionId}/artifacts`)).json();

    const tampered = structuredClone(original);
    const firstOption = Object.keys(tampered.result.counts)[0]!;
    tampered.result.counts[firstOption] += 1; // tampered_total

    await page.goto("/audit/lab");
    await page.getByRole("radio", { name: /total adulterado|tampered_total/i }).check();
    await page.getByRole("button", { name: /verificar/i }).click();
    await expect(page.getByRole("status")).toContainText(/fallo detectado/i, { timeout: 10_000 });
    await expect(page.getByText(/discrepancia/i)).toBeVisible();

    const verifyApi = await request.post("/api/audit/verify", { data: { package: tampered } });
    const audit = await verifyApi.json();
    expect(audit.valid).toBe(false);

    const again = await (await request.get(`/api/elections/${electionId}/artifacts`)).json();
    expect(again).toEqual(original);
  });

  test.fixme("8. verificador no disponible ⇒ 'no verificable', nunca 'verificado'", async ({ page, request }) => {
    const { electionId } = await seedElection(request);
    await request.post(`/api/elections/${electionId}/close`);
    await page.route("**/api/audit/verify", (route) => route.fulfill({ status: 503, body: JSON.stringify({ error: "down", code: "unavailable" }) }));
    await page.goto("/audit");
    await page.getByLabel(/id de elección|paquete/i).fill(electionId);
    await page.getByRole("button", { name: /verificar/i }).click();
    await expect(page.getByRole("status")).toContainText(/no verificable/i);
    await expect(page.getByText(/^verificado$/i)).toHaveCount(0);
  });
});

test.describe("Móvil 360px (proyecto mobile-360)", () => {
  test.fixme("el flujo del votante cabe en 360px sin scroll horizontal y con foco visible", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "solo en el proyecto mobile-360");
    const { invites } = await seedElection(request);
    await page.goto(invites[0]!.inviteUrl);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "sin scroll horizontal").toBeLessThanOrEqual(0);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["A", "BUTTON", "INPUT"]).toContain(focused);
  });

  test.fixme("resultados en vivo y centro de transparencia son legibles en 360px", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "solo en el proyecto mobile-360");
    const { electionId } = await seedElection(request);
    for (const path of [`/e/${electionId}/live`, `/e/${electionId}`]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} sin scroll horizontal`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Accesibilidad (spec §9)", () => {
  test.fixme("los estados del voto se anuncian en una live region y los errores no dependen solo del color", async ({ page, request }) => {
    const { invites } = await seedElection(request);
    await page.goto(invites[0]!.inviteUrl);
    await expect(page.getByRole("status").or(page.locator("[aria-live]")).first()).toBeAttached();
    // axe-core: añadir @axe-core/playwright cuando la UI exista y fallar en violaciones serias/críticas.
  });
});
