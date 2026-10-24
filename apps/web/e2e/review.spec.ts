import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";

/**
 * D-21 · revisión manual de duplicados contra MOCKS del contrato (e2e/mocks/v1.ts). Datos FIXTURE.
 * El caso contra el servidor real (dos credenciales, mismo rostro simulado, el organizador aprueba desde el panel,
 * ambos votan y el paquete verificado declara manualApprovals.count=1) está en e2e/badge.real.spec.ts.
 * Capturas 360 (pendiente y panel con caso): `SCREENSHOTS=1 … e2e/review.spec.ts --project=mobile-360`.
 */
/** Lista prohibida de e2e/voter-taps.spec.ts sin "credencial": la pantalla nombra la credencial FÍSICA del evento. */
const FORBIDDEN_BUT_BADGE = /\bwallet|smart wallet|\bfirma|EIP-?712|FaceBinding|Semaphore|nullifier|commitment|Kernel|eoa-demo|on-?chain|blockchain|Base Sepolia|ZeroDev|testnet|Detalles técnicos/i;
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
const CODE = "K7M3QP";

async function shot(page: Page, name: string) {
  if (!process.env.SCREENSHOTS || test.info().project.name !== "mobile-360") return;
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `${name}-360.png`), fullPage: true, animations: "disabled" });
}

function badgeElection(m: MockV1) {
  m.eligibility = { method: "event-badge", badgeCheck: "live", badgeUrlPrefix: "https://hack.platan.us/26-ve/id/" };
  m.room = { code: CODE, open: true, seatsTaken: 3, maxSeats: 60, expiresAt: new Date(Date.now() + 12 * 60_000).toISOString(), closedReason: null };
}

test.describe("votante · caso en revisión", () => {
  test("rostro coincide con credencial propia → 'revisión rápida' → el organizador aprueba → sigue solo a ¡Listo!", async ({ page }) => {
    const mock = new MockV1("registration");
    badgeElection(mock);
    mock.facePending = true;
    await mock.install(page);
    await page.goto(`/v/${E2E.token}`);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "Tu caso necesita una revisión rápida." })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Muéstrale tu credencial al organizador.")).toBeVisible();
    await expect(page.getByTestId("review-pending")).toContainText("Esperando al organizador");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(FORBIDDEN_BUT_BADGE);
    expect(text).not.toMatch(/coincid|similitud|gemel|duplicad/i);
    await shot(page, "revision-01-pendiente");
    // Recargar mantiene la pantalla (la invitación dice review: "pending").
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tu caso necesita una revisión rápida." })).toBeVisible({ timeout: 30_000 });
    // El organizador aprueba → la página sigue sola: vinculación → ¡Listo!
    mock.review = "approved";
    await expect(page.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 30_000 });
    expect(mock.wallet?.bindingSignature).toMatch(/^0x[0-9a-f]+$/);
    expect(mock.commitment).toMatch(/^\d+$/);
  });

  test("el organizador rechaza → 'No pudimos verificar tu identidad. Habla con el organizador.'", async ({ page }) => {
    const mock = new MockV1("registration");
    badgeElection(mock);
    mock.review = "pending";
    await mock.install(page);
    await page.goto(`/v/${E2E.token}`);
    await expect(page.getByRole("heading", { name: "Tu caso necesita una revisión rápida." })).toBeVisible({ timeout: 30_000 });
    mock.review = "rejected";
    await expect(page.getByRole("heading", { name: "No pudimos verificar tu identidad" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Habla con el organizador/)).toBeVisible();
    await shot(page, "revision-03-rechazado");
  });
});

test.describe("organizador · casos por revisar", () => {
  test("tarjeta 'Casos por revisar (1)', aviso junto a abrir, 'X de Y listos', aprobar con confirmación", async ({ page }) => {
    const mock = new MockV1("registration");
    badgeElection(mock);
    mock.review = "pending";
    await mock.install(page);
    await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken] as const);
    await page.goto(`/org/${E2E.electionId}`);
    const card = page.getByTestId("reviews-card");
    await expect(card.getByRole("heading", { name: "Casos por revisar (1)" })).toBeVisible();
    await expect(card.getByTestId("review-item")).toContainText("Participante");
    await expect(card).not.toContainText(/similitud|%|v-ana/);
    // Aviso junto a los dos botones de abrir: casos pendientes y "X de Y listos" (mock: 3 de 9).
    await expect(page.getByTestId("open-readiness")).toContainText("3 de 9 listos · Hay 1 caso por revisar");
    await shot(page, "revision-02-panel-caso");

    // Confirmar la apertura avisa ANTES: el caso se rechaza solo y hay personas a medio inscribir.
    await page.getByTestId("phase-action").click();
    await expect(page.getByTestId("open-warning").first()).toHaveText("Hay 1 caso por revisar. Si abres ahora, se rechaza automáticamente.");
    await expect(page.getByTestId("open-warning").nth(1)).toHaveText("3 de 9 personas terminaron. Las demás no podrán votar. ¿Abrir igual?");
    await page.getByRole("button", { name: "Cancelar" }).first().click();

    // Aprobar pide confirmación.
    await card.getByTestId("review-approve").click();
    await expect(card).toContainText("¿Viste a esta persona y su credencial?");
    await card.getByTestId("review-confirm").click();
    await expect(card.getByRole("heading", { name: "Casos por revisar (0)" })).toBeVisible();
    await expect(card.getByTestId("reviews-decided")).toContainText("1 aprobados, 0 rechazados");
    expect(mock.reviewDecisions).toEqual([{ decision: "approve" }]);
    await expect(page.getByTestId("open-readiness")).toHaveText("3 de 9 listos");
  });

  test("rechazar con confirmación", async ({ page }) => {
    const mock = new MockV1("registration");
    badgeElection(mock);
    mock.review = "pending";
    await mock.install(page);
    await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken] as const);
    await page.goto(`/org/${E2E.electionId}`);
    const card = page.getByTestId("reviews-card");
    await card.getByTestId("review-reject").click();
    await expect(card).toContainText("Esta persona no podrá votar. ¿Rechazar?");
    await card.getByTestId("review-confirm").click();
    await expect(card.getByRole("heading", { name: "Casos por revisar (0)" })).toBeVisible();
    expect(mock.reviewDecisions).toEqual([{ decision: "reject" }]);
  });
});
