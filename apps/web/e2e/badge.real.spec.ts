import { expect, test, type Browser } from "@playwright/test";
import { fakeCamera, qrDataUrl } from "./mocks/badgeCamera";

/**
 * D-19 · credencial del evento contra el SERVIDOR REAL (`next start`, DATA_DIR temporal, sin claves on-chain). Sin mocks.
 * `badgeCheck: "list"` para no depender de internet. 2 personas escanean su credencial (cámara simulada con el QR real
 * de la credencial; lector real del producto) → rostro (simulado solo en E2E) → ¡Listo!; una tercera intenta reusar una
 * credencial → "Esta credencial ya se usó en esta votación."; se abre la votación, votan las 2 con prueba Groth16 real y
 * al cerrar el paquete declara `rollPolicy: event-badge` y el verificador independiente lo da por válido.
 * Usuarios ficticios (no son participantes reales).
 */
const TITLE = "Premio del público (ficticio): ¿qué demo te gustó más?";
const PREFIX = "https://hack.platan.us/26-ve/id/";
const USERS = ["participante-ficticio-1", "participante-ficticio-2"] as const;

async function phone(browser: Browser) {
  return browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "es-VE", timezoneId: "America/Caracas" });
}

test("credencial real: 2 entran escaneando, reusar → rechazo, votan, cierre verificado con rollPolicy event-badge", async ({ browser, request }) => {
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
  const election = (await created.json()) as { id: string; organizerToken: string; eligibility: unknown };
  expect(election.eligibility).toEqual({ method: "event-badge", badgeCheck: "list", badgeUrlPrefix: PREFIX, allowlistCount: 2 });
  const { id, organizerToken } = election;
  const auth = { Authorization: `Bearer ${organizerToken}` };
  expect((await request.post(`/api/elections/${id}/publish`, { headers: auth })).ok()).toBe(true);
  const room = (await (await request.post(`/api/elections/${id}/room`, { headers: auth, data: { maxSeats: 10, expiresInMin: 15 } })).json()) as { roomCode: string };
  const code = room.roomCode;
  // La elección pública nunca expone los usuarios.
  expect(JSON.stringify(await (await request.get(`/api/elections/${id}`)).json())).not.toContain(USERS[0]);

  const voters = [];
  for (const user of USERS) {
    const ctx = await phone(browser);
    const p = await ctx.newPage();
    await fakeCamera(p, await qrDataUrl(`${PREFIX}${user}`));
    const t0 = Date.now();
    await p.goto(`/j/${code}`);
    await expect(p.getByRole("heading", { name: TITLE })).toBeVisible();
    await p.getByRole("button", { name: "Escanear mi credencial" }).click();
    await p.waitForURL(/\/v\/[^/]+$/, { timeout: 30_000 });
    await expect(p.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 60_000 });
    console.log(`[credencial-real] ${user.slice(-1)}: /j → ¡Listo! ${Date.now() - t0} ms`);
    voters.push({ ctx, p, link: p.url() });
  }

  // Tercera persona con una credencial ya usada (escaneada) → rechazo claro; nadie más entra.
  const ctx3 = await phone(browser);
  const p3 = await ctx3.newPage();
  await fakeCamera(p3, await qrDataUrl(`${PREFIX}${USERS[0]}`));
  await p3.goto(`/j/${code}`);
  await p3.getByRole("button", { name: "Escanear mi credencial" }).click();
  await expect(p3.getByText("Esta credencial ya se usó en esta votación.")).toBeVisible({ timeout: 30_000 });
  // Por API también: reuse 409, desconocida 404, QR ajeno 400.
  const reuse = await request.post(`/api/rooms/${code}/join-badge`, { data: { badgeUrl: `${PREFIX}${USERS[1].toUpperCase()}` } });
  expect(reuse.status()).toBe(409);
  expect(await reuse.json()).toEqual({ code: "badge_used", error: "Esta credencial ya se usó en esta votación." });
  expect((await request.post(`/api/rooms/${code}/join-badge`, { data: { badgeUrl: `${PREFIX}no-esta-en-la-lista` } })).status()).toBe(404);
  expect((await request.post(`/api/rooms/${code}/join-badge`, { data: { badgeUrl: "https://example.com/x" } })).status()).toBe(400);
  await ctx3.close();

  // Abrir la votación (congela el padrón) y votar desde los dos teléfonos.
  expect((await request.post(`/api/elections/${id}/open`, { headers: auth })).ok()).toBe(true);
  for (const v of voters) {
    await v.p.goto(v.link);
    await v.p.getByRole("radio", { name: /Demo A$/ }).click();
    await v.p.getByRole("button", { name: "Votar: Demo A" }).click();
    await expect(v.p.getByTestId("receipt")).toContainText("incluido", { timeout: 90_000 });
    await v.ctx.close();
  }

  // Cerrar → paquete + verificador independiente.
  const closed = await request.post(`/api/elections/${id}/close`, { headers: auth });
  expect(closed.ok()).toBe(true);
  expect(((await closed.json()) as { status: string }).status).toBe("auditable");
  const art = (await (await request.get(`/api/elections/${id}/artifacts`)).json()) as { rollPolicy: Record<string, unknown> };
  expect(art.rollPolicy).toMatchObject({ kind: "event-badge", check: "list", face: "full", joined: 2, enrolled: 2, maxSeats: 10 });
  const raw = JSON.stringify(art);
  for (const u of USERS) expect(raw).not.toContain(u);
  const audit = (await (await request.get(`/api/elections/${id}/audit`)).json()) as { auditResult: { valid: boolean; unsupportedGuarantees: string[] } };
  expect(audit.auditResult.valid).toBe(true);
  expect(audit.auditResult.unsupportedGuarantees.find((g) => g.startsWith("credencial-de-evento"))).toMatch(/se usa una sola vez/);
  const tally = (await (await request.get(`/api/elections/${id}/tally`)).json()) as { totalVotes: number };
  expect(tally.totalVotes).toBe(2);
});
