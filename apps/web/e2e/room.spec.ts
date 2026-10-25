import { expect, test } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";
import { openMore } from "./helpers/org";

/**
 * Sala abierta contra MOCKS del contrato (e2e/mocks/v1.ts, § "Sala abierta"). Datos FIXTURE.
 * El caso contra el servidor real está en e2e/room.real.spec.ts (config playwright.real.config.ts).
 */
const CODE = "K7M3QP";
const openRoom = (m: MockV1, seats = 60, taken = 0) => {
  m.room = { code: CODE, open: true, seatsTaken: taken, maxSeats: seats, expiresAt: new Date(Date.now() + 12 * 60_000).toISOString(), closedReason: null };
};

test.describe("sala abierta · /j/[roomCode]", () => {
  test("nombre o apodo + Continuar → /v/<token> abre directo la cámara y queda inscrito; recargar /j retoma", async ({ page }) => {
    const mock = new MockV1("registration");
    openRoom(mock, 60, 26);
    await mock.install(page);

    await page.goto(`/j/${CODE.toLowerCase()}`);
    await expect(page.getByRole("heading", { name: E2E.title })).toBeVisible();
    // Sin contador de lugares: solo el título y "La entrada cierra en …" (gris, pequeño).
    await expect(page.getByTestId("room-closes-in")).toHaveText(/^La entrada cierra en \d+:\d{2}$/);
    expect(await page.locator("main").textContent()).not.toMatch(/lugares/);
    await expect(page.getByText("Cómo usamos tu cámara")).toBeVisible();
    // Precarga de lo pesado mientras escribe el alias: service worker + Cache Storage (localhost es contexto seguro).
    await expect(page.locator("html")).toHaveAttribute("data-heavy-prefetch", "service-worker", { timeout: 20_000 });
    const cached = await page.evaluate(async () => (await (await caches.open("quorum-heavy-v2")).keys()).map((r) => new URL(r.url).pathname));
    expect(cached).toEqual(expect.arrayContaining(["/zk/semaphore-10.zkey", "/zk/semaphore-10.wasm", "/models/insightface-u8.bin", "/models/blazeface-f16.json", "/tfjs/4.22.0/tfjs-backend-wasm-simd.wasm"]));
    // 8 archivos de modelos (sin malla, faceres ni iris) + WASM SIMD + 2 artefactos ZK: lo mismo que HEAVY_ASSETS.
    expect(cached).toHaveLength(11);
    expect(cached.some((p) => /iris|facemesh|faceres/.test(p))).toBe(false);
    // Lo guardado está descomprimido y es usable (el servidor lo manda con Content-Encoding: gzip).
    const head = await page.evaluate(async () => {
      const r = await (await caches.open("quorum-heavy-v2")).match("/models/insightface-u8.json");
      return (await r!.text()).slice(0, 1);
    });
    expect(head).toBe("{");

    await page.getByLabel("Tu nombre o apodo").fill("0412 555 1234");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(/No uses tu teléfono/)).toBeVisible();
    expect(mock.joins).toHaveLength(0);

    await page.getByLabel("Tu nombre o apodo").fill("Vecina del 4B");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForURL(`**/v/${E2E.token}`);
    expect(mock.joins).toEqual(["Vecina del 4B"]);
    const stored = await page.evaluate((c) => localStorage.getItem(`quorum.room.${c}`), CODE);
    expect(JSON.parse(stored!).inviteToken).toBe(E2E.token);

    // Ya aceptó en /j: no se repite el consentimiento; el paso 2 (rostro) arranca solo y la vinculación también.
    await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("waiting-enrolled")).toContainText("Ya estás inscrito");
    expect(mock.commitment).toMatch(/^\d+$/);

    await page.goto(`/j/${CODE}`);
    await expect(page.getByTestId("room-resume")).toContainText("Vecina del 4B");
    await page.getByTestId("room-resume").getByRole("button", { name: "Continuar" }).click();
    await page.waitForURL(`**/v/${E2E.token}`);
    expect(mock.joins).toHaveLength(1);
    await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible();
  });

  test("sala llena → modo observador (ver en vivo, verificar, sorteo)", async ({ page }) => {
    const mock = new MockV1("registration");
    openRoom(mock, 2, 2);
    await mock.install(page);
    await page.goto(`/j/${CODE}`);
    await expect(page.getByText("La sala está llena")).toBeVisible();
    const obs = page.getByTestId("observer-mode");
    await expect(obs.getByRole("link", { name: /Ver en vivo/ })).toHaveAttribute("href", `/e/${E2E.electionId}/live`);
    await expect(obs.getByRole("link", { name: /Comprobar el resultado/ })).toHaveAttribute("href", `/e/${E2E.electionId}#verificar`);
    await expect(obs.getByRole("link", { name: /Ver el sorteo/ })).toHaveAttribute("href", `/e/${E2E.electionId}/draw`);
    await expect(page.getByLabel("Tu nombre o apodo")).toHaveCount(0);
  });

  test("la votación ya comenzó → observador; se llenó mientras escribía (409) → observador", async ({ page }) => {
    const mock = new MockV1("open");
    openRoom(mock);
    mock.room!.open = false;
    mock.room!.closedReason = "election-opened";
    await mock.install(page);
    await page.goto(`/j/${CODE}`);
    await expect(page.getByText("La votación ya comenzó")).toBeVisible();
    await expect(page.getByTestId("observer-mode")).toBeVisible();

    mock.phase = "registration";
    openRoom(mock, 5, 4);
    await page.goto(`/j/${CODE}`);
    await page.getByLabel("Tu nombre o apodo").fill("Ana");
    mock.room!.seatsTaken = 5; // alguien tomó el último lugar
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("La sala está llena")).toBeVisible();
    await expect(page.getByTestId("observer-mode")).toBeVisible();
  });
});

test.describe("panel del organizador · «Más › Sala»", () => {
  test("abrir con tope y minutos, ver código y joinUrl en la cabina, ampliar y cerrar", async ({ page, context }) => {
    const mock = new MockV1("registration");
    await mock.installContext(context);
    await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken] as const);
    await page.goto(`/org/${E2E.electionId}`);
    await expect(page.getByTestId("cockpit-open-room")).toBeVisible(); // sala cerrada: la cabina ofrece abrirla
    await openMore(page, "room");
    const card = page.getByTestId("room-card");
    await expect(card.getByTestId("room-state")).toHaveText("Sin abrir");
    await card.getByLabel("Tope de personas").fill("60");
    await card.getByLabel("Minutos abierta").fill("15");
    await card.getByTestId("room-open").click();
    // El QR, el código y el enlace viven en la cabina (no se repiten dentro de «Más»).
    await expect(page.getByTestId("room-code")).toHaveText(CODE);
    await expect(page.getByTestId("qr")).toHaveAttribute("data-qr-value", new RegExp(`/j/${CODE}$`));
    await expect(card.getByTestId("room-code")).toHaveCount(0);
    await expect(page.getByTestId("org-clock")).toHaveAttribute("role", "timer");
    // Inicio programado: por defecto, el cierre de la sala (15 min); «+5 min» y «Empezar en 5 min».
    const start = card.getByTestId("start-countdown");
    await expect(start).toContainText(/La votación empieza en 1[45]:\d\d/);
    await card.getByTestId("start-plus-5").click();
    await expect(start).toContainText(/La votación empieza en (19|20):\d\d/);
    await card.getByTestId("start-in-5").click();
    await expect(start).toContainText(/La votación empieza en 0[45]:\d\d/);
    expect(mock.schedules).toEqual([{ addSeconds: 300 }, { inSeconds: 300 }]);
    await expect(page.getByTestId("room-join-url")).toHaveText(new RegExp(`/j/${CODE}$`));
    await expect(card.getByTestId("room-open")).toContainText("Ampliar");

    await card.getByLabel("Tope de personas").fill("80");
    await card.getByTestId("room-open").click();
    await expect(card.getByTestId("room-seats-org")).toContainText("de 80");
    await expect(page.getByTestId("room-code")).toHaveText(CODE); // mismo código, mismo QR
    await expect(page.getByTestId("org-seats")).toContainText("de 80");

    await card.getByRole("button", { name: "Cerrar sala" }).click();
    await card.getByRole("button", { name: "Sí, cerrar sala" }).click();
    await expect(card.getByTestId("room-state")).toHaveText("Cerrada por el organizador");
  });
});
