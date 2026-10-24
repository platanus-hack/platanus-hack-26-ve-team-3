import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fakeCamera, qrDataUrl } from "./mocks/badgeCamera";
import { E2E, MockV1 } from "./mocks/v1";

/**
 * D-19 — entrar con la credencial del evento contra MOCKS del contrato (datos FIXTURE).
 * La cámara se simula con un `<canvas>` que dibuja el QR de la credencial (`captureStream`): el lector real (BarcodeDetector
 * nativo o jsqr) lo decodifica igual que un cuadro de cámara. Mide tiempos y toques; con SCREENSHOTS=1 guarda capturas 360.
 *   E2E_PROD=1 PORT=3343 QUORUM_NEXT_DIST_DIR=.next-e2e-badge pnpm --filter @quorum/web exec playwright test e2e/badge.spec.ts
 *   (+ QUORUM_E2E_WEBKIT=1 --project=webkit-360 para WebKit; QUORUM_SLOW_NET=1 limita la red en Chromium)
 */
const CODE = "K7M3QP";
const PREFIX = "https://hack.platan.us/26-ve/id/";
/** Lista ampliada de voter-taps.spec.ts. En `/j` con credencial, "credencial" es el objeto físico del evento (lo que
 * pidió producto: "Escanear mi credencial"), así que ahí se permite; en `/v` (espera) vale la lista completa. */
const FORBIDDEN = /\bwallet|smart wallet|\bfirma|EIP-?712|FaceBinding|Semaphore|credencial|nullifier|commitment|Kernel|eoa-demo|on-?chain|blockchain|Base Sepolia|ZeroDev|testnet|Detalles técnicos/i;
const FORBIDDEN_ON_BADGE_PAGE = new RegExp(FORBIDDEN.source.replace("|credencial", ""), "i");
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");

function badgeMock(over: (m: MockV1) => void = () => undefined) {
  const mock = new MockV1("registration");
  mock.room = { code: CODE, open: true, seatsTaken: 41, maxSeats: 120, expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(), closedReason: null };
  mock.eligibility = { method: "event-badge", badgeCheck: "live", badgeUrlPrefix: PREFIX };
  // Inicio programado: la credencial también termina en la espera con cuenta regresiva.
  mock.votingStartsAt = new Date(Date.now() + 20 * 60_000).toISOString();
  over(mock);
  return mock;
}

async function shot(page: Page, name: string) {
  if (!process.env.SCREENSHOTS || page.viewportSize()?.width !== 360) return;
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `credencial-${name}-360.png`), fullPage: true, animations: "disabled" });
}

async function slowNet(page: Page) {
  if (!process.env.QUORUM_SLOW_NET) return;
  const cdp = await page.context().newCDPSession(page).catch(() => null);
  // "4G lento del evento": 1,5 Mbps de bajada, 0,75 de subida, 300 ms de latencia.
  await cdp?.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
}

test.describe("credencial del evento · /j/[roomCode]", () => {
  test("escanear la credencial → rostro → ¡Listo! (1 toque) con tiempos medidos", async ({ page }, info) => {
    const mock = badgeMock();
    await mock.install(page);
    const noNative = Boolean(process.env.QUORUM_E2E_NO_NATIVE_QR);
    await fakeCamera(page, await qrDataUrl(`${PREFIX}jgalvis414`), noNative);
    await slowNet(page);
    const jsBytes = { before: 0, after: 0 };
    let scanning = false;
    page.on("response", async (r) => {
      if (r.request().resourceType() !== "script") return;
      const len = Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      if (scanning) jsBytes.after += len;
      else jsBytes.before += len;
    });

    const t0 = Date.now();
    await page.goto(`/j/${CODE}`);
    const scanBtn = page.getByRole("button", { name: "Escanear mi credencial" });
    await expect(scanBtn).toBeVisible();
    const tReady = Date.now();
    await expect(page.getByTestId("step-indicator")).toContainText("Paso 1 de 2");
    await expect(page.getByText(/Al tocar Escanear mi credencial, aceptas/)).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN_ON_BADGE_PAGE);
    expect(await page.locator("main").textContent()).not.toMatch(FORBIDDEN_ON_BADGE_PAGE);
    await shot(page, "01-inicio");

    let taps = 0;
    scanning = true;
    const tTap = Date.now();
    await scanBtn.click();
    taps++;
    await page.waitForURL(`**/v/${E2E.token}`, { timeout: 30_000 });
    const tJoined = Date.now();
    expect(mock.badgeJoins).toEqual(["jgalvis414"]);
    await expect(page.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 60_000 });
    const tDone = Date.now();
    // Espera con cuenta regresiva (inicio programado) y sin jerga (lista completa de voter-taps).
    await expect(page.getByTestId("voting-countdown")).toContainText("La votación empieza en");
    await expect(page.getByTestId("countdown-value")).toHaveText(/^(19|20):\d\d$/);
    expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
    const detector = await page.evaluate(() => document.documentElement.getAttribute("data-qr-detector"));
    // El paso 2 no repite el consentimiento: rostro directo.
    const stored = JSON.parse((await page.evaluate((c) => localStorage.getItem(`quorum.room.${c}`), CODE))!) as { displayName: string; consentAt: string };
    expect(stored.displayName).toBe("Participante");
    expect(stored.consentAt).toBeTruthy();

    // Texto oculto/plegado de /v (sin la página /j que Next conserva oculta tras navegar): recargar y revisar todo.
    await page.reload();
    await expect(page.getByTestId("countdown-value")).toHaveText(/^(19|20):\d\d$/);
    expect(await page.locator("main").textContent()).not.toMatch(FORBIDDEN);

    const timing = {
      project: info.project.name,
      slowNet: Boolean(process.env.QUORUM_SLOW_NET),
      detector,
      taps,
      pageReadyMs: tReady - t0,
      tapToJoinedMs: tJoined - tTap,
      joinedToListoMs: tDone - tJoined,
      totalMs: tDone - t0,
      jsBytesBeforeTap: jsBytes.before,
      jsBytesAfterTap: jsBytes.after,
    };
    console.log(`[credencial-timing] ${JSON.stringify(timing)}`);
    info.annotations.push({ type: "timing", description: JSON.stringify(timing) });
  });

  test("QR ajeno → aviso y sigue; credencial usada → 409 claro; credencial nueva → entra", async ({ page }) => {
    const mock = badgeMock((m) => m.badgeUsed.add("ana-hack"));
    await mock.install(page);
    await fakeCamera(page, await qrDataUrl("https://example.com/menu-del-evento"));
    await page.goto(`/j/${CODE}`);
    await page.getByRole("button", { name: "Escanear mi credencial" }).click();
    await expect(page.getByTestId("badge-scanner")).toBeVisible();
    await expect(page.getByText("Ese QR no es una credencial de Platanus Hack.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Apunta al QR de tu credencial")).toBeVisible();
    await shot(page, "02-escaneando-qr-ajeno");

    await page.evaluate(async (u) => (window as unknown as { __setQr: (x: string) => void }).__setQr(u), await qrDataUrl(`${PREFIX}ana-hack`));
    await expect(page.getByText("Esta credencial ya se usó en esta votación.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Escanear otra vez" })).toBeVisible();
    await shot(page, "03-ya-usada");
    expect(mock.badgeJoins).toEqual([]);

    await page.evaluate(async (u) => (window as unknown as { __setQr: (x: string) => void }).__setQr(u), await qrDataUrl(`${PREFIX}beto-hack`));
    await page.getByRole("button", { name: "Escanear otra vez" }).click();
    await page.waitForURL(`**/v/${E2E.token}`, { timeout: 30_000 });
    expect(mock.badgeJoins).toEqual(["beto-hack"]);
  });

  test("sin cámara: 'o escribe tu usuario' → desconocida (404) → corregir → entra", async ({ page }) => {
    const mock = badgeMock();
    await mock.install(page);
    await page.goto(`/j/${CODE}`);
    await page.getByRole("button", { name: "o escribe tu usuario" }).click();
    await page.getByLabel("o escribe tu usuario").fill("nadie-aqui");
    await shot(page, "04-escribir-usuario");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("No encontramos esta credencial en el evento.")).toBeVisible();
    await shot(page, "05-desconocida");
    await page.getByLabel("o escribe tu usuario").fill("@jgalvis414");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(`**/v/${E2E.token}`);
    await expect(page.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 60_000 });
    await shot(page, "06-listo");
    expect(mock.badgeJoins).toEqual(["jgalvis414"]);
  });
});

test.describe("organizador y proyector (credencial)", () => {
  test("asistente: '¿Quién puede votar?' con credencial por defecto; crea con eligibility", async ({ page }) => {
    const mock = new MockV1("registration");
    await mock.install(page);
    await page.goto("/org/new");
    await page.getByLabel("Título de la votación").fill("Premio del público (fixture)");
    await page.locator("#opt-0").fill("Equipo A");
    await page.locator("#opt-1").fill("Equipo B");
    await page.getByRole("button", { name: "Continuar" }).click();
    const picker = page.getByTestId("eligibility-picker");
    await expect(picker.getByRole("radio", { name: /Credencial del evento/ })).toBeChecked();
    await expect(page.getByText(/Verificación de rostro/)).toHaveCount(0);
    await picker.locator("label", { hasText: "Con mi lista" }).click();
    await picker.getByLabel(/Usuarios permitidos/).fill("jgalvis414\n@ana-hack\nhttps://hack.platan.us/26-ve/id/beto-hack");
    await expect(picker.getByText(/3 usuarios/)).toBeVisible();
    await shot(page, "07-organizador-quien-puede-votar");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByTestId("review-eligibility")).toContainText("Credencial del evento (comprobación con lista) + rostro");
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect.poll(() => mock.createBodies.length).toBe(1);
    expect((mock.createBodies[0] as { eligibility: unknown }).eligibility).toEqual({ method: "event-badge", badgeCheck: "list", badgeUrlPrefix: PREFIX, badgeAllowlist: ["jgalvis414", "ana-hack", "beto-hack"] });
  });

  test("tarjeta de sala: cambiar a credencial antes de que entre nadie; proyector: 'Escanea este código y luego tu credencial'", async ({ page }) => {
    const mock = new MockV1("registration");
    mock.room = { code: CODE, open: true, seatsTaken: 0, maxSeats: 120, expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(), closedReason: null };
    await mock.install(page);
    await page.addInitScript(([eid, t]) => sessionStorage.setItem(`quorum.orgToken.${eid}`, t), [E2E.electionId, E2E.orgToken] as const);
    await page.goto(`/org/${E2E.electionId}`);
    const card = page.getByTestId("room-card");
    await expect(card.getByTestId("room-eligibility")).toContainText("Apodo libre");
    await card.getByText("Cambiar quién puede votar").click();
    await card.getByRole("radio", { name: /Credencial del evento/ }).check();
    await card.getByTestId("eligibility-save").click();
    await expect(card.getByTestId("room-eligibility")).toContainText("Credencial del evento (comprobación en vivo)");
    expect(mock.eligibilityPuts).toEqual([{ method: "event-badge", badgeCheck: "live", badgeUrlPrefix: PREFIX }]);
    await shot(page, "08-tarjeta-sala");

    await page.goto(`/e/${E2E.electionId}/proyector#t=${E2E.orgToken}`);
    await expect(page.getByTestId("projector-instruction")).toHaveText("Escanea este código y luego tu credencial");
    await expect(page.getByTestId("qr")).toBeVisible();
    await shot(page, "09-proyector");
  });
});
