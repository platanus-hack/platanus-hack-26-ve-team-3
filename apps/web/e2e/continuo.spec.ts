import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";

/** PNG de 1×1 (fixture) con el formato `OptionImage` del contrato: basta para ver la foto en la tarjeta. */
const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * D-22 modo continuo (al instante) contra MOCKS del contrato (e2e/mocks/v1.ts). La prueba Semaphore sí se genera de
 * verdad en el navegador. El E2E real sin mocks es `continuo.real.spec.ts`.
 */
const CODE = "K7M3QP";
const FORBIDDEN = /\bwallet|smart wallet|\bfirma|EIP-?712|FaceBinding|Semaphore|credencial|nullifier|commitment|Kernel|eoa-demo|on-?chain|blockchain|Base Sepolia|ZeroDev|testnet|Detalles técnicos/i;

async function plain(page: Page) {
  expect((await page.locator("main").textContent()) ?? "").not.toMatch(FORBIDDEN);
}

function continuousMock(phase: "draft" | "open") {
  const mock = new MockV1(phase);
  mock.continuous = true;
  if (phase === "open") mock.room = { code: CODE, open: true, seatsTaken: 3, maxSeats: 500, expiresAt: new Date(Date.now() + 170 * 60_000).toISOString(), closedReason: null };
  return mock;
}

test.describe("modo continuo (mocks)", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("votante: entra con la votación abierta → ¡Listo! → aviso de K → la boleta aparece sola → vota", async ({ page }) => {
    test.setTimeout(90_000);
    const mock = continuousMock("open");
    mock.groupSize = 3;
    // La opción 2 lleva foto y subtítulo (fixture); las demás, solo nombre.
    mock.options = E2E.options.map((o, i) => (i === 1 ? { ...o, subtitle: "Equipo B (fixture)", image: PNG_1x1 } : o));
    await mock.install(page);
    await page.goto(`/j/${CODE}`);
    await page.getByLabel("Tu nombre o apodo").fill("Vecina del 4B");
    await page.getByRole("button", { name: "Continuar" }).click();
    // Inscripción completada en plena votación: sin pantalla de espera de "hora de inicio"; espera animada con el dato de K.
    await expect(page.getByTestId("enrolled-banner")).toContainText("¡Listo! Ya estás inscrito.", { timeout: 30_000 });
    await expect(page.getByTestId("waiting-pulse")).toHaveAttribute("data-mode", "continuous");
    await expect(page.getByTestId("waiting-pulse-detail")).toHaveText("Falta 1 persona para habilitar el voto (ahora 4 de 5)");
    await expect(page.getByTestId("anonymity-gate-text")).toHaveText("Tu voto se habilita cuando haya 5 personas inscritas (ahora 4)");
    await expect(page.getByTestId("voting-countdown")).toHaveCount(0);
    await plain(page);
    // Entra una persona más → la boleta aparece sola
    mock.groupSize = 5;
    await expect(page.getByRole("radio")).toHaveCount(5, { timeout: 10_000 });
    const second = page.getByRole("radio").nth(1);
    await expect(second.locator("img")).toBeVisible();
    await expect(second.locator("img")).toHaveAttribute("alt", "");
    await expect(second.getByTestId("option-subtitle")).toHaveText("Equipo B (fixture)");
    await expect(page.getByRole("radio").nth(0).locator("img")).toHaveCount(0);
    await expect(page.getByRole("radio").nth(0).getByTestId("option-avatar")).toHaveText("1");
    await second.click();
    await page.getByRole("button", { name: "Votar: 2" }).click();
    await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 60_000 });
    await plain(page);
    expect(mock.voteBodies).toHaveLength(1);
  });

  test("organizador: «Al instante» se elige en «Avanzado» (el diseño aprobado propone «Con hora de inicio») y se envía al crear", async ({ page }) => {
    const mock = continuousMock("draft");
    await mock.install(page);
    await page.goto("/org/new");
    await page.getByTestId("advanced-segment").click();
    const picker = page.getByTestId("voting-mode-picker");
    await expect(picker.getByRole("radio", { name: /Con hora de inicio/ })).toBeChecked();
    await picker.locator("label", { hasText: "Al instante" }).click();
    await expect(picker.getByRole("radio", { name: /Al instante/ })).toBeChecked();
    await page.getByTestId("advanced-sheet").getByRole("button", { name: "Listo" }).click();
    await page.getByLabel("Pregunta de la votación").fill("Evento ficticio: ¿qué charla repetimos?");
    await page.getByLabel("Opción A", { exact: true }).fill("Charla A");
    await page.getByLabel("Opción B", { exact: true }).fill("Charla B");
    await page.getByTestId("publish").click();
    await page.waitForURL(`**/org/${E2E.electionId}/listo`);
    expect((mock.createBodies[0] as { votingMode: string }).votingMode).toBe("continuous");
    await expect(page.getByTestId("ready-state")).toHaveText(/Votación abierta/);
  });

  test("organizador: el panel en modo continuo solo tiene Abrir (inscripción + votación) y Cerrar, con contadores en vivo", async ({ page }) => {
    const mock = continuousMock("draft");
    await mock.install(page);
    await page.addInitScript(([eid, t]) => sessionStorage.setItem(`quorum.orgToken.${eid}`, t), [E2E.electionId, E2E.orgToken] as const);
    await page.goto(`/org/${E2E.electionId}`);
    const card = page.getByTestId("continuous-card");
    await expect(card.getByTestId("phase-action")).toHaveCount(0);
    await card.getByTestId("continuous-open").click();
    await card.getByTestId("continuous-confirm").click();
    await expect.poll(() => mock.phase).toBe("open"); // Abrir en borrador = publicar + abrir sala
    await expect(card.getByTestId("room-join-url")).toContainText(`/j/${CODE}`);
    await expect(card.getByTestId("continuous-open")).toHaveCount(0);
    mock.groupSize = 27;
    mock.votes = 19;
    await expect(card.getByTestId("live-enrolled")).toHaveText("27", { timeout: 8000 });
    await expect(card.getByTestId("live-voted")).toHaveText("19");
    await expect(page.getByTestId("room-card")).toHaveCount(0); // sin hora de inicio ni "Abrir ahora"
    await card.getByTestId("continuous-close").click();
    await card.getByTestId("continuous-confirm").click();
    await expect.poll(() => mock.phase).toBe("auditable");
    // Panel cerrado: la misma carta del ganador que /live (aquí «sin desglose»: el mock continuo publica count: null) y sin «verificado» (GET /audit → 404).
    const win = page.getByTestId("winner-screen");
    await expect(win).toBeVisible({ timeout: 8000 });
    await expect(win).toHaveAttribute("data-outcome", "hidden");
    await expect(win.getByTestId("winner-verdict")).toContainText("pendiente de comprobar");
    await expect(page.getByTestId("live-breakdown")).toHaveAttribute("data-headline-only", "true");
  });

});
