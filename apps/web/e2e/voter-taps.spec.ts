import { expect, test, type Page } from "@playwright/test";
import { MockV1 } from "./mocks/v1";

/**
 * Flujo simple del votante (pedido de producto): cuenta las interacciones REALES (eventos `click` con `isTrusted`,
 * los que produce un toque) de quien escanea el QR. Objetivo:
 *   inscripción ≤ 2 toques + escribir el nombre o apodo + permitir la cámara;  voto ≤ 2 toques.
 * También: sin jerga técnica en el flujo principal, texto base ≥ 18 px y boleta de 5 opciones sin scroll a 360×740.
 * Contra MOCKS del contrato (e2e/mocks/v1.ts); la prueba Semaphore sí se genera de verdad en el navegador.
 * Pedido de producto: el votante no se entera de wallets ni de blockchain ("un proceso de verificación para votar"):
 * la lista prohibida cubre también lo plegado (ya no hay "Detalles técnicos" en el flujo del votante).
 */
const CODE = "K7M3QP";
const FORBIDDEN = /\bwallet|smart wallet|\bfirma|EIP-?712|FaceBinding|Semaphore|credencial|nullifier|commitment|Kernel|eoa-demo|on-?chain|blockchain|Base Sepolia|ZeroDev|testnet|Detalles técnicos/i;

async function taps(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __taps: number }).__taps);
}

/** Texto visible Y oculto/plegado del flujo (textContent incluye <details> cerrados y sr-only). */
async function expectPlainLanguage(page: Page) {
  const visible = await page.locator("main").innerText();
  expect(visible).not.toMatch(FORBIDDEN);
  const all = (await page.locator("main").textContent()) ?? "";
  expect(all).not.toMatch(FORBIDDEN);
}

test.use({ viewport: { width: 360, height: 740 } });

test("votante: inscripción en ≤ 2 toques (+ nombre + cámara) y voto en ≤ 2 toques, en lenguaje simple", async ({ page }) => {
  test.setTimeout(90_000);
  const mock = new MockV1("registration");
  mock.room = { code: CODE, open: true, seatsTaken: 12, maxSeats: 60, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), closedReason: null };
  await mock.install(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __taps: number };
    w.__taps = 0;
    document.addEventListener("click", (e) => e.isTrusted && (w.__taps += 1), true);
  });

  /* ---------- Inscripción ---------- */
  await page.goto(`/j/${CODE}`);
  await expect(page.getByTestId("step-indicator")).toContainText("Paso 1 de 2");
  await expectPlainLanguage(page);
  const base = await page.locator("main > div").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(base).toBeGreaterThanOrEqual(18);

  await page.getByLabel("Tu nombre o apodo").click(); // toque 1 (enfocar el campo)
  await page.keyboard.type("Vecina del 4B"); // escribir
  await page.getByRole("button", { name: "Continuar" }).click(); // toque 2
  // Paso 2: la cámara arranca sola (aquí, rostro simulado de E2E sin botón) y la vinculación corre en segundo plano.
  await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("waiting-enrolled")).toContainText("Ya estás inscrito");
  await expect(page.getByTestId("waiting-pulse-detail")).toHaveText("El organizador la abrirá");
  const registrationTaps = await taps(page);
  expect(registrationTaps).toBeLessThanOrEqual(2);
  await expectPlainLanguage(page);
  expect(mock.joins).toEqual(["Vecina del 4B"]);
  expect(mock.commitment).toMatch(/^\d+$/);

  /* ---------- Cuenta regresiva: el organizador programa el inicio; nadie toca nada ---------- */
  mock.votingStartsAt = new Date(Date.now() + 9_000).toISOString();
  await expect(page.getByTestId("countdown-value")).toHaveText(/^00:0\d$/, { timeout: 10_000 });
  await expect(page.getByTestId("voting-countdown")).toContainText("La votación empieza en");
  await expect(page.getByTestId("waiting-pulse-detail")).toHaveText(/^Empieza a las \d{1,2}:\d{2}/);
  await expectPlainLanguage(page);

  /* ---------- Voto ---------- */
  const options = page.getByRole("radio");
  await expect(options).toHaveCount(5, { timeout: 20_000 }); // la boleta aparece sola al llegar a 0
  expect(mock.phase).toBe("open");
  await expectPlainLanguage(page);
  // 5 opciones sin scroll: todas dentro de la pantalla, cada una ≥ 56 px.
  for (let i = 0; i < 5; i++) {
    const box = (await options.nth(i).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(56);
    expect(box.y + box.height).toBeLessThanOrEqual(740);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const before = await taps(page);
  await options.nth(2).click(); // toque 1: elegir "3"
  const vote = page.getByRole("button", { name: "Votar: 3" });
  const voteBox = (await vote.boundingBox())!;
  const lastOption = (await options.nth(4).boundingBox())!;
  expect(voteBox.y + voteBox.height).toBeLessThanOrEqual(740); // el botón se ve sin hacer scroll…
  expect(lastOption.y + lastOption.height).toBeLessThanOrEqual(voteBox.y); // …y no tapa la última opción
  await vote.click(); // toque 2: votar (es la confirmación)
  await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 60_000 });
  const votingTaps = (await taps(page)) - before;
  expect(votingTaps).toBeLessThanOrEqual(2);
  await expectPlainLanguage(page);
  expect((mock.voteBodies[0] as { proof: { message: string } }).proof.message).toBe("2");

  test.info().annotations.push({ type: "toques", description: `inscripción ${registrationTaps} · voto ${votingTaps}` });
  console.log(`[toques] inscripción ${registrationTaps} (+ escribir nombre + cámara) · voto ${votingTaps}`);
});

test("modo continuo (al instante): QR → comprobante en ≤ 4 toques (+ nombre + cámara), aviso de K claro y reintento por grupo nuevo sin toques extra", async ({ page }) => {
  test.setTimeout(90_000);
  const mock = new MockV1("open");
  mock.continuous = true;
  mock.groupSize = 3; // con ella serán 4: aún falta 1 para K=5
  mock.staleRootReplies = 1; // su primera prueba llega con una raíz fuera de la ventana
  mock.room = { code: CODE, open: true, seatsTaken: 3, maxSeats: 500, expiresAt: new Date(Date.now() + 170 * 60_000).toISOString(), closedReason: null };
  await mock.install(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __taps: number };
    w.__taps = 0;
    document.addEventListener("click", (e) => e.isTrusted && (w.__taps += 1), true);
  });

  await page.goto(`/j/${CODE}`);
  await expectPlainLanguage(page);
  await page.getByLabel("Tu nombre o apodo").click(); // toque 1
  await page.keyboard.type("Vecina del 4B");
  await page.getByRole("button", { name: "Continuar" }).click(); // toque 2
  await expect(page.getByTestId("enrolled-banner")).toContainText("¡Listo! Ya estás inscrito.", { timeout: 30_000 });
  const registrationTaps = await taps(page);
  expect(registrationTaps).toBeLessThanOrEqual(2);

  // Aviso de K dentro de la espera animada: cuántas faltan, la frase completa y la razón en lenguaje simple (sin prometer anonimato).
  await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible();
  await expect(page.getByTestId("waiting-pulse-detail")).toHaveText("Falta 1 persona para habilitar el voto (ahora 4 de 5)");
  await expect(page.getByTestId("anonymity-gate-text")).toHaveText("Tu voto se habilita cuando haya 5 personas inscritas (ahora 4)");
  await expect(page.getByTestId("anonymity-gate")).toContainText("Deja esta página abierta: la boleta aparecerá aquí sola.");
  expect(await page.getByTestId("anonymity-gate").textContent()).not.toMatch(/anónim|secreto|nadie puede saber/i);
  await expectPlainLanguage(page);
  mock.groupSize = 5;
  const options = page.getByRole("radio");
  await expect(options).toHaveCount(5, { timeout: 10_000 }); // sola, sin tocar nada
  expect(await taps(page)).toBe(registrationTaps);

  const before = await taps(page);
  await options.nth(1).click(); // toque 3
  await page.getByRole("button", { name: "Votar: 2" }).click(); // toque 4
  await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 60_000 });
  const votingTaps = (await taps(page)) - before;
  expect(votingTaps).toBeLessThanOrEqual(2);
  expect(mock.voteBodies).toHaveLength(2); // stale_root → nueva prueba con el grupo nuevo, sola
  await expectPlainLanguage(page);
  test.info().annotations.push({ type: "toques", description: `continuo: inscripción ${registrationTaps} · voto ${votingTaps} · total ${registrationTaps + votingTaps}` });
  console.log(`[toques continuo] inscripción ${registrationTaps} (+ escribir nombre + cámara) · voto ${votingTaps} · total ${registrationTaps + votingTaps}`);
});
