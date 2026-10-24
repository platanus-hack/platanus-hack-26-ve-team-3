import { expect, test, type Browser } from "@playwright/test";
import { fakeCamera, qrDataUrl } from "./mocks/badgeCamera";

/**
 * D-21 · revisión manual de duplicados contra el SERVIDOR REAL (`next start`, DATA_DIR temporal, sin claves on-chain).
 * Caso real de la prueba con iPhones: gemelos idénticos con credenciales distintas. Aquí: dos personas escanean su propia
 * credencial (cámara simulada con el QR real) y el rostro simulado es el MISMO para las dos (`quorum.e2e.faceSeed`):
 * la primera queda inscrita; la segunda ve "Tu caso necesita una revisión rápida."; el organizador la aprueba desde el
 * panel (con confirmación); su teléfono sigue solo a "¡Listo!"; votan las dos con prueba Groth16 real; al cerrar el
 * paquete declara `manualApprovals.count = 1` y el verificador independiente lo da por válido y lo muestra.
 * Usuarios ficticios.
 */
const TITLE = "Premio del público (ficticio): ¿qué demo te gustó más? — revisión";
const PREFIX = "https://hack.platan.us/26-ve/id/";
const USERS = ["gemela-ficticia-1", "gemela-ficticia-2"] as const;

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "es-VE", timezoneId: "America/Caracas" });
  // Mismo rostro simulado para las dos personas (gemelos).
  await ctx.addInitScript(() => sessionStorage.setItem("quorum.e2e.faceSeed", "gemelos-ficticios"));
  return ctx;
}

test("gemelos con credenciales distintas: el segundo queda en revisión → el organizador aprueba en el panel → ambos votan → manualApprovals.count=1 verificado", async ({ browser, request }) => {
  const now = Date.now();
  const created = await request.post("/api/elections", {
    data: {
      title: TITLE,
      description: "Prueba automatizada. Datos ficticios.",
      kind: "yes-no",
      options: [
        { id: "a", label: "Demo A" },
        { id: "b", label: "Demo B" },
      ],
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
      eligibility: { method: "event-badge", badgeCheck: "list", badgeAllowlist: [...USERS] },
    },
  });
  expect(created.status()).toBe(201);
  const { id, organizerToken } = (await created.json()) as { id: string; organizerToken: string };
  const auth = { Authorization: `Bearer ${organizerToken}` };
  expect((await request.post(`/api/elections/${id}/publish`, { headers: auth })).ok()).toBe(true);
  const room = (await (await request.post(`/api/elections/${id}/room`, { headers: auth, data: { maxSeats: 10, expiresInMin: 15, votingStartsAt: null } })).json()) as { roomCode: string };

  // 1) Primera persona: inscrita normal.
  const voters = [];
  for (const [i, user] of USERS.entries()) {
    const ctx = await phone(browser);
    const p = await ctx.newPage();
    await fakeCamera(p, await qrDataUrl(`${PREFIX}${user}`));
    await p.goto(`/j/${room.roomCode}`);
    await p.getByRole("button", { name: "Escanear mi credencial" }).click();
    await p.waitForURL(/\/v\/[^/]+$/, { timeout: 30_000 });
    if (i === 0) await expect(p.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 60_000 });
    else {
      // 2) Segunda persona, mismo rostro, credencial propia → revisión (no rechazo).
      await expect(p.getByRole("heading", { name: "Tu caso necesita una revisión rápida." })).toBeVisible({ timeout: 60_000 });
      await expect(p.getByText("Muéstrale tu credencial al organizador.")).toBeVisible();
      expect(await p.locator("main").innerText()).not.toMatch(/\bwallet|\bfirma|EIP-?712|FaceBinding|Semaphore|nullifier|commitment|on-?chain|blockchain|coincid|similitud/i);
    }
    voters.push({ ctx, p, link: p.url() });
  }

  // 3) El organizador ve el caso en el panel y lo aprueba (con confirmación).
  const orgCtx = await browser.newContext({ locale: "es-VE", timezoneId: "America/Caracas" });
  await orgCtx.addInitScript(([eid, t]) => sessionStorage.setItem(`quorum.orgToken.${eid}`, t), [id, organizerToken] as const);
  const org = await orgCtx.newPage();
  await org.goto(`/org/${id}`);
  const card = org.getByTestId("reviews-card");
  await expect(card.getByRole("heading", { name: "Casos por revisar (1)" })).toBeVisible({ timeout: 30_000 });
  await expect(org.getByTestId("open-readiness")).toContainText("1 de 2 listos · Hay 1 caso por revisar");
  const listed = await (await request.get(`/api/elections/${id}/reviews`, { headers: auth })).json();
  expect(JSON.stringify(listed)).not.toMatch(/similar|sealed|descriptor|vt_/);
  await card.getByTestId("review-approve").click();
  await card.getByTestId("review-confirm").click();
  await expect(card.getByRole("heading", { name: "Casos por revisar (0)" })).toBeVisible();

  // 4) El teléfono de la segunda persona sigue solo: vinculación → ¡Listo!
  await expect(voters[1].p.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 60_000 });
  await expect(org.getByTestId("open-readiness")).toHaveText("2 de 2 listos", { timeout: 15_000 });

  // 5) Abrir desde el panel (sin avisos: todos listos y sin casos) y votar desde los dos teléfonos.
  await org.getByTestId("phase-action").click();
  await expect(org.getByTestId("open-warning")).toHaveCount(0);
  await org.getByRole("button", { name: /^Sí, congelar padrón/ }).click();
  await expect(org.getByText("Votación abierta").first()).toBeVisible({ timeout: 15_000 });
  for (const v of voters) {
    await v.p.goto(v.link);
    await v.p.getByRole("radio", { name: /Demo A$/ }).click();
    await v.p.getByRole("button", { name: "Votar: Demo A" }).click();
    await expect(v.p.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 90_000 });
    await v.ctx.close();
  }
  await orgCtx.close();

  // 6) Cerrar → paquete + verificador independiente con la aprobación manual declarada.
  const closed = await request.post(`/api/elections/${id}/close`, { headers: auth });
  expect(((await closed.json()) as { status: string }).status).toBe("auditable");
  const art = (await (await request.get(`/api/elections/${id}/artifacts`)).json()) as Record<string, unknown>;
  expect(art.manualApprovals).toMatchObject({ count: 1, method: "organizer-in-person" });
  expect(art.rollPolicy).toMatchObject({ kind: "event-badge", joined: 2, enrolled: 2 });
  const raw = JSON.stringify(art);
  for (const u of USERS) expect(raw).not.toContain(u);
  expect(raw).not.toMatch(/rv_|vt_/);
  const audit = (await (await request.get(`/api/elections/${id}/audit`)).json()) as { auditResult: { valid: boolean; unsupportedGuarantees: string[] } };
  expect(audit.auditResult.valid).toBe(true);
  const note = audit.auditResult.unsupportedGuarantees.find((g) => g.startsWith("aprobacion-manual"));
  expect(note).toMatch(/1 inscripción aprobada manualmente por el organizador tras coincidencia facial/);
  console.log(`[revision-real] ${note}`);
  const tally = (await (await request.get(`/api/elections/${id}/tally`)).json()) as { totalVotes: number };
  expect(tally.totalVotes).toBe(2);
});
