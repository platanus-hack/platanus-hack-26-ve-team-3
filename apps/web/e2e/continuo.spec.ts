import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";

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
    await mock.install(page);
    await page.goto(`/j/${CODE}`);
    await page.getByLabel("Tu nombre o apodo").fill("Vecina del 4B");
    await page.getByRole("button", { name: "Continuar" }).click();
    // Inscripción completada en plena votación: sin pantalla de espera de "hora de inicio".
    await expect(page.getByTestId("enrolled-banner")).toContainText("¡Listo! Ya estás inscrito.", { timeout: 30_000 });
    await expect(page.getByTestId("anonymity-gate-text")).toHaveText("Tu voto se habilita cuando haya 5 personas inscritas (ahora 4)");
    await expect(page.getByTestId("voting-countdown")).toHaveCount(0);
    await plain(page);
    // Entra una persona más → la boleta aparece sola
    mock.groupSize = 5;
    await expect(page.getByRole("radio")).toHaveCount(5, { timeout: 10_000 });
    await page.getByRole("radio").nth(1).click();
    await page.getByRole("button", { name: "Votar: 2" }).click();
    await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 60_000 });
    await plain(page);
    expect(mock.voteBodies).toHaveLength(1);
  });

  test("organizador: el asistente propone «Al instante» y lo envía al crear", async ({ page }) => {
    const mock = continuousMock("draft");
    await mock.install(page);
    await page.goto("/org/new");
    const picker = page.getByTestId("voting-mode-picker");
    await expect(picker.getByRole("radio", { name: /Al instante/ })).toBeChecked();
    await expect(picker).toContainText("Recomendado para eventos");
    await expect(picker.getByRole("radio", { name: /Con hora de inicio/ })).not.toBeChecked();
    await page.getByLabel("Título de la votación").fill("Evento ficticio: ¿qué charla repetimos?");
    await page.locator("#opt-0").fill("Charla A");
    await page.locator("#opt-1").fill("Charla B");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByTestId("review-voting-mode")).toContainText("Al instante");
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect.poll(() => mock.createBodies.length).toBe(1);
    expect((mock.createBodies[0] as { votingMode: string }).votingMode).toBe("continuous");
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
  });

  test("proyector: QR + «27 inscritos · 19 votaron» en vivo", async ({ page }) => {
    const mock = continuousMock("open");
    mock.groupSize = 27;
    mock.votes = 19;
    await mock.install(page);
    await page.goto(`/e/${E2E.electionId}/proyector#t=${E2E.orgToken}`);
    await expect(page.getByTestId("qr")).toHaveAttribute("data-qr-value", new RegExp(`/j/${CODE}$`));
    await expect(page.getByTestId("projector-live-counts")).toHaveText(/27\s*inscritos · 19\s*votaron/);
    mock.groupSize = 28;
    await expect(page.getByTestId("projector-live-counts")).toHaveText(/28\s*inscritos · 19\s*votaron/, { timeout: 8000 });
  });
});
