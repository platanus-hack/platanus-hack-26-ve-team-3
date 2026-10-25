import { expect, test, type Browser } from "@playwright/test";
import { openMore } from "./helpers/org";

/**
 * Sala abierta contra el SERVIDOR REAL (`next start`, DATA_DIR temporal, sin claves on-chain). Sin mocks.
 * crear elección → abrir inscripción → abrir sala desde el panel (tope 2) → 2 personas entran por /j → llegan a /v/<token>
 * → paso 2 automático: quedan inscritos → la tercera encuentra la sala llena → modo observador. El proyector (con token) muestra el QR del joinUrl.
 */
const TITLE = "Asamblea de prueba E2E (ficticia): ¿pintamos el pasillo?";

async function phone(browser: Browser) {
  return browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: "es-VE" });
}

test("sala real: 2 entran por /j y llegan a /v/<token>; la sala llena ofrece modo observador", async ({ page, request, browser, baseURL }) => {
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

  // Panel del organizador: tarjeta "Sala abierta".
  await page.addInitScript(([eid, t]) => sessionStorage.setItem(`quorum.orgToken.${eid}`, t), [id, organizerToken] as const);
  await page.goto(`/org/${id}`);
  await openMore(page, "room");
  const card = page.getByTestId("room-card");
  await expect(card.getByTestId("room-state")).toHaveText("Sin abrir");
  await card.getByLabel("Tope de personas").fill("2");
  await card.getByLabel("Minutos abierta").fill("10");
  await card.getByTestId("room-open").click();
  // Código, QR y enlace: en la cabina del panel.
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  const code = (await page.getByTestId("room-code").textContent())!.trim();
  await expect(page.getByTestId("room-join-url")).toHaveText(`${baseURL}/j/${code}`);

  // El GET público NO revela joinUrl ni roomCode.
  const pub = (await (await request.get(`/api/elections/${id}/room`)).json()) as Record<string, unknown>;
  expect(pub.open).toBe(true);
  expect(pub.joinUrl).toBeUndefined();
  expect(pub.roomCode).toBeUndefined();

  // Dos teléfonos entran.
  for (const alias of ["Vecina 4B", "Vecino PB"]) {
    const ctx = await phone(browser);
    const p = await ctx.newPage();
    await p.goto(`/j/${code.toLowerCase()}`);
    await expect(p.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(p.getByTestId("step-indicator")).toContainText("Paso 1 de 2");
    await p.getByLabel("Tu nombre o apodo").fill(alias);
    await p.getByRole("button", { name: "Continuar" }).click();
    await p.waitForURL(/\/v\/[^/]+$/);
    const token = p.url().split("/v/")[1];
    const stored = JSON.parse((await p.evaluate((c) => localStorage.getItem(`quorum.room.${c}`), code))!) as { inviteToken: string };
    expect(stored.inviteToken).toBe(token);
    // /v/<token> (invitación real, fase inscripción): ya aceptó en /j → paso 2 directo (rostro simulado sólo en E2E) y
    // vinculación en segundo plano contra el servidor real (FaceBinding verificado + commitment).
    await expect(p.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 60_000 });
    await ctx.close();
  }

  await expect(card.getByTestId("room-seats-org")).toContainText("2 de 2", { timeout: 8000 });

  // Tercera persona: sala llena → observador.
  const ctx3 = await phone(browser);
  const p3 = await ctx3.newPage();
  await p3.goto(`/j/${code}`);
  await expect(p3.getByText("La sala está llena")).toBeVisible();
  await expect(p3.getByTestId("observer-mode")).toBeVisible();
  await expect(p3.getByLabel("Tu nombre o apodo")).toHaveCount(0);
  // Y el servidor lo confirma si alguien insiste por API: 409 room_full.
  const forced = await request.post(`/api/rooms/${code}/join`, { data: { displayName: "Insistente" } });
  expect(forced.status()).toBe(409);
  expect(((await forced.json()) as { code: string }).code).toBe("room_full");
  await ctx3.close();

  // Proyector con el token del organizador: QR del joinUrl y contador.
  const proj = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await proj.goto(`/e/${id}/proyector#t=${encodeURIComponent(organizerToken)}`);
  await expect(proj.getByTestId("projector-seats")).toContainText("2 de 2 inscritos");
  await expect(proj.getByTestId("qr")).toHaveAttribute("data-qr-value", `${baseURL}/j/${code}`);
  await proj.close();
});
