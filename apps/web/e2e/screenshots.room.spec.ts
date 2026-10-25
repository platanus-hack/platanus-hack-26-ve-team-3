import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, fixtureAudit, MockV1, type Phase } from "./mocks/v1";
import { openMore } from "./helpers/org";

/**
 * Capturas de la sala abierta y del proyector a 360 y 1440 px con datos FIXTURE (mocks del contrato).
 *   E2E_PROD=1 PORT=3337 SCREENSHOTS=1 pnpm --filter @quorum/web exec playwright test e2e/screenshots.room.spec.ts --project=chromium
 * Salida: docs/screenshots/phase2/sala-*.png y proyector-*.png
 */
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
const WIDTHS = [360, 1440] as const;
const CODE = "K7M3QP";

test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));

async function shot(page: Page, name: string, width: number, fullPage = true) {
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage, animations: "disabled" });
}

async function at(page: Page, width: number, phase: Phase, setup?: (m: MockV1) => void) {
  await page.setViewportSize(width < 768 ? { width, height: 740 } : { width, height: 900 });
  const mock = new MockV1(phase);
  mock.room = { code: CODE, open: true, seatsTaken: 27, maxSeats: 60, expiresAt: new Date(Date.now() + 9 * 60_000 + 30_000).toISOString(), closedReason: null };
  setup?.(mock);
  await mock.install(page);
  return mock;
}

for (const w of WIDTHS) {
  test.describe(`sala ${w}px`, () => {
    test(`entrar ${w}`, async ({ page }) => {
      await at(page, w, "registration");
      await page.goto(`/j/${CODE}`);
      await page.getByLabel("Tu nombre o apodo").fill("Vecina del 4B");
      await shot(page, "sala-01-entrar", w);
      await page.getByLabel("Tu nombre o apodo").fill("0412 555 1234");
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page.getByText(/No uses tu teléfono/)).toBeVisible();
      await shot(page, "sala-02-alias-invalido", w);
    });

    test(`llena ${w}`, async ({ page }) => {
      await at(page, w, "registration", (m) => (m.room!.seatsTaken = 60));
      await page.goto(`/j/${CODE}`);
      await expect(page.getByTestId("observer-mode")).toBeVisible();
      await shot(page, "sala-03-llena-observador", w);
    });

    test(`votación comenzó ${w}`, async ({ page }) => {
      await at(page, w, "open", (m) => Object.assign(m.room!, { open: false, closedReason: "election-opened" }));
      await page.goto(`/j/${CODE}`);
      await expect(page.getByText("La votación ya comenzó")).toBeVisible();
      await shot(page, "sala-04-votacion-comenzo", w);
    });

    test(`retomar ${w}`, async ({ page }) => {
      await at(page, w, "registration");
      await page.addInitScript((c) => localStorage.setItem(`quorum.room.${c}`, JSON.stringify({ roomCode: c, electionId: "e2e-samanes", voterId: "v-ana", displayName: "Vecina del 4B", inviteToken: "tok-e2e-ana", invitePath: "/v/tok-e2e-ana", joinedAt: "x", consentAt: "x" })), CODE);
      await page.goto(`/j/${CODE}`);
      await expect(page.getByTestId("room-resume")).toBeVisible();
      await shot(page, "sala-05-retomar", w);
    });

    test(`panel organizador ${w}`, async ({ page }) => {
      await at(page, w, "registration");
      await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken] as const);
      await page.goto(`/org/${E2E.electionId}`);
      await expect(page.getByTestId("room-code")).toHaveText(CODE);
      await openMore(page, "room");
      const card = page.getByTestId("room-card");
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: path.join(OUT, `sala-06-panel-organizador-${w}.png`), animations: "disabled" });
    });
  });

  test.describe(`proyector ${w}px`, () => {
    test(`inscripción ${w}`, async ({ page }) => {
      await at(page, w, "registration");
      await page.goto(`/e/${E2E.electionId}/proyector#t=${E2E.orgToken}`);
      await expect(page.getByTestId("qr")).toBeVisible();
      await expect(page.getByTestId("projector-seats")).toContainText("27 de 60");
      await shot(page, "proyector-01-inscripcion", w, w < 768);
    });

    test(`votación ${w}`, async ({ page }) => {
      await at(page, w, "open");
      await page.goto(`/e/${E2E.electionId}/proyector`);
      await expect(page.getByTestId("projector-bars")).toBeVisible();
      await shot(page, "proyector-02-votacion", w, w < 768);
    });

    test(`resultado verificado ${w}`, async ({ page }) => {
      await at(page, w, "auditable", (m) => {
        m.auditBody = fixtureAudit(true);
        m.anchorTx = `0x${"ab".repeat(32)}`;
      });
      await page.goto(`/e/${E2E.electionId}/proyector`);
      await expect(page.getByTestId("projector-verifier")).toContainText("verificado");
      await shot(page, "proyector-03-resultado", w, w < 768);
    });

    test(`fallo detectado ${w}`, async ({ page }) => {
      await at(page, w, "failed", (m) => (m.auditBody = fixtureAudit(false)));
      await page.goto(`/e/${E2E.electionId}/proyector`);
      await expect(page.getByTestId("projector-verifier")).toContainText("fallo detectado");
      await shot(page, "proyector-04-fallo-detectado", w, w < 768);
    });

    test(`sorteo ${w}`, async ({ page }) => {
      await at(page, w, "drawn", (m) => (m.auditBody = fixtureAudit(true)));
      await page.goto(`/e/${E2E.electionId}/proyector`);
      await expect(page.getByTestId("projector-winners").locator("li")).toHaveCount(2);
      await shot(page, "proyector-05-sorteo", w, w < 768);
    });
  });
}
