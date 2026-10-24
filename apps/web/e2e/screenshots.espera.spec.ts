import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";

/**
 * Capturas de la espera con cuenta regresiva y del comprobante sin jerga, a 360×740, con datos FIXTURE (mocks).
 *   PORT=3361 SCREENSHOTS=1 pnpm --filter @quorum/web exec playwright test e2e/screenshots.espera.spec.ts --project=chromium
 * Salida: docs/screenshots/phase2/espera-*.png
 */
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
const CODE = "K7M3QP";

test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));
test.use({ viewport: { width: 360, height: 740 } });

async function shot(page: Page, name: string, width = 360, fullPage = false) {
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `espera-${name}-${width}.png`), fullPage, animations: "disabled" });
}

function mockAt(): MockV1 {
  const mock = new MockV1("registration");
  mock.room = { code: CODE, open: true, seatsTaken: 27, maxSeats: 60, expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(), closedReason: null };
  return mock;
}

test("votante: sin hora → cuenta regresiva → abriendo → boleta → comprobante", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = mockAt();
  await mock.install(page);
  await page.goto(`/v/${E2E.token}`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("voting-countdown")).toContainText("Esperando que el organizador abra la votación…");
  await shot(page, "01-sin-hora");

  mock.votingStartsAt = new Date(Date.now() + 4 * 60_000 + 37_000).toISOString();
  await expect(page.getByTestId("countdown-value")).toHaveText(/^04:3\d$/, { timeout: 10_000 });
  await shot(page, "02-cuenta");

  // Llega la hora; el mock retiene la apertura unos segundos para capturar "Abriendo la votación…".
  mock.holdSchedule = true;
  mock.votingStartsAt = new Date(Date.now() + 2_000).toISOString();
  await expect(page.getByTestId("voting-countdown")).toHaveAttribute("data-state", "opening", { timeout: 15_000 });
  await shot(page, "03-abriendo");
  mock.holdSchedule = false;
  await expect(page.getByRole("radio")).toHaveCount(5, { timeout: 15_000 });
  await shot(page, "04-boleta-sola");

  await page.getByRole("radio", { name: /3$/ }).click();
  await page.getByRole("button", { name: "Votar: 3" }).click();
  await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 60_000 });
  await shot(page, "05-comprobante", 360, true);
});

test("panel y proyector con la hora de inicio", async ({ page, context }) => {
  const mock = mockAt();
  mock.votingStartsAt = new Date(Date.now() + 4 * 60_000 + 37_000).toISOString();
  await mock.installContext(context);
  await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken] as const);
  await page.goto(`/org/${E2E.electionId}`);
  const card = page.getByTestId("room-card");
  await expect(card.getByTestId("start-countdown")).toContainText(/La votación empieza en 04:3\d/);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(OUT, "espera-06-panel-360.png"), animations: "disabled" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/e/${E2E.electionId}/proyector#t=${E2E.orgToken}`);
  await expect(page.getByTestId("projector-start-countdown")).toContainText(/La votación empieza en 04:3\d/);
  await page.waitForTimeout(300);
  await shot(page, "07-proyector", 1440);
});
