import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Inicio programado contra el SERVIDOR REAL (`next start`, DATA_DIR temporal, sin red). Sin mocks.
 * crear → abrir inscripción → sala → 2 votantes se inscriben y quedan esperando → el organizador fija el inicio a +20 s
 * (`votingStartsInSec: 20` en `POST /room`) → los teléfonos muestran "La votación empieza en 00:xx" → al llegar a 0 la
 * boleta aparece SOLA (nadie llama a `POST /open`: la primera petición después de la hora abre la votación) → se vota.
 * Con SCREENSHOTS=1 guarda capturas reales a 360 px en docs/screenshots/phase2/espera-real-*.png.
 */
const TITLE = "Asamblea de prueba E2E (ficticia): ¿cambiamos la hora de la reunión?";
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "es-VE", timezoneId: "America/Caracas" });
  return { ctx, page: await ctx.newPage() };
}

async function shot(page: Page, name: string) {
  if (!process.env.SCREENSHOTS) return;
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `espera-real-${name}-360.png`), animations: "disabled" });
}

test("inicio programado real: cuenta regresiva en los teléfonos y la boleta aparece sola", async ({ request, browser }) => {
  const now = Date.now();
  const created = await request.post("/api/elections", {
    data: {
      title: TITLE,
      description: "Prueba automatizada. Datos ficticios.",
      kind: "yes-no",
      options: [
        { id: "si", label: "Sí" },
        { id: "no", label: "No" },
      ],
      votingMode: "phased", // con hora de inicio (el modo continuo es el predeterminado)
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const { id, organizerToken } = (await created.json()) as { id: string; organizerToken: string };
  const auth = { Authorization: `Bearer ${organizerToken}` };
  expect((await request.post(`/api/elections/${id}/publish`, { headers: auth })).ok()).toBe(true);
  // Sala sin hora (a mano) mientras la gente se inscribe.
  const room = await request.post(`/api/elections/${id}/room`, { headers: auth, data: { maxSeats: 10, expiresInMin: 10, votingStartsAt: null } });
  expect(room.status()).toBe(201);
  const { roomCode } = (await room.json()) as { roomCode: string };

  const phones: { page: Page; close: () => Promise<void> }[] = [];
  for (const alias of ["Vecina 4B", "Vecino PB"]) {
    const { ctx, page } = await phone(browser);
    await page.goto(`/j/${roomCode}`);
    await page.getByLabel("Tu nombre o apodo").fill(alias);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("voting-countdown")).toContainText("Esperando que el organizador abra la votación…");
    phones.push({ page, close: () => ctx.close() });
  }
  await shot(phones[0].page, "01-sin-hora");

  // El organizador fija el inicio a +20 s (hora del servidor). Desde aquí NADIE toca nada.
  const t0 = Date.now();
  const resched = await request.post(`/api/elections/${id}/room`, { headers: auth, data: { maxSeats: 10, expiresInMin: 10, votingStartsInSec: 20 } });
  expect(resched.status()).toBe(200);
  const { votingStartsAt } = (await resched.json()) as { votingStartsAt: string };
  expect(Date.parse(votingStartsAt) - t0).toBeGreaterThan(15_000);
  // GET público de la elección y de la sala exponen la hora.
  expect(((await (await request.get(`/api/elections/${id}`)).json()) as { votingStartsAt: string }).votingStartsAt).toBe(votingStartsAt);
  expect(((await (await request.get(`/api/rooms/${roomCode}`)).json()) as { votingStartsAt: string }).votingStartsAt).toBe(votingStartsAt);

  for (const { page } of phones) {
    await expect(page.getByTestId("voting-countdown")).toContainText("La votación empieza en", { timeout: 8_000 });
    const v = (await page.getByTestId("countdown-value").textContent())!.trim();
    expect(v).toMatch(/^00:[0-2]\d$/);
  }
  await shot(phones[0].page, "02-cuenta");
  console.log(`[espera] cuenta visible en los 2 teléfonos: ${(await phones[0].page.getByTestId("countdown-value").textContent())?.trim()}`);

  // Llega la hora: la boleta aparece sola en ambos teléfonos (sondeo de 2 s al final + consulta al llegar a 0).
  for (const { page } of phones) await expect(page.getByRole("radio", { name: "Sí" })).toBeVisible({ timeout: 40_000 });
  const appearedAfter = Date.now() - Date.parse(votingStartsAt);
  console.log(`[espera] boleta visible ${appearedAfter} ms después de la hora programada (reloj local del runner)`);
  const e = (await (await request.get(`/api/elections/${id}`)).json()) as { status: string; groupRoot: string | null };
  expect(e.status).toBe("open");
  expect(e.groupRoot).toMatch(/^\d+$/);
  const roll = (await (await request.get(`/api/elections/${id}/roll`)).json()) as { frozen: boolean; commitments: string[] };
  expect(roll.frozen).toBe(true);
  expect(roll.commitments).toHaveLength(2);
  const r = (await (await request.get(`/api/elections/${id}/room`)).json()) as { open: boolean; closedReason: string };
  expect(r).toMatchObject({ open: false, closedReason: "election-opened" });

  // Y se vota normalmente.
  const p = phones[0].page;
  await p.getByRole("radio", { name: "Sí" }).click();
  await p.getByRole("button", { name: "Votar: Sí" }).click();
  await expect(p.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 90_000 });
  await expect(p.getByTestId("receipt")).toContainText("Código de tu comprobante");
  await expect(p.getByTestId("tech-details")).toHaveCount(0);
  await shot(p, "03-comprobante");
  for (const ph of phones) await ph.close();
});
