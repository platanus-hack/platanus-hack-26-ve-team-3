import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1, type Phase } from "./mocks/v1";

/**
 * Capturas de la fase 2 a 360 / 768 / 1440 px con datos FIXTURE (mocks del contrato v1).
 * Sólo corre con `SCREENSHOTS=1` y en el proyecto chromium:
 *   PORT=3317 SCREENSHOTS=1 pnpm --filter @quorum/web exec playwright test e2e/screenshots.phase2.spec.ts --project=chromium
 * Salida: docs/screenshots/phase2/<pantalla>-<ancho>.png
 */
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
const WIDTHS = [360, 768, 1440] as const;

test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));

async function shot(page: Page, name: string, width: number) {
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true, animations: "disabled" });
}

async function at(page: Page, width: number, phase: Phase, setup?: (m: MockV1) => void) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
  const mock = new MockV1(phase);
  setup?.(mock);
  await mock.install(page);
  return mock;
}

for (const w of WIDTHS) {
  test.describe(`capturas ${w}px`, () => {
    test(`landing ${w}`, async ({ page }) => {
      await at(page, w, "registration");
      await page.goto("/");
      await shot(page, "01-landing", w);
    });

    test(`votante: inscripción y voto ${w}`, async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await at(page, w, "registration");
      await page.goto(`/v/${E2E.token}`);
      await expect(page.getByRole("heading", { name: E2E.title })).toBeVisible();
      await shot(page, "02-votante-invitacion", w);
      await page.getByRole("button", { name: "Inscribirme" }).click();
      await page.getByLabel("Nombre").fill("Vecina Ana (ficticia)");
      await page.getByRole("checkbox").check();
      await shot(page, "03-votante-datos-consentimiento", w);
      await page.getByRole("button", { name: /continuar a la prueba de vida/i }).click();
      await expect(page.getByText("modo demo · no certificada")).toBeVisible();
      await shot(page, "04-votante-rostro", w);
      await page.getByTestId("e2e-fake-face").click();
      await expect(page.getByTestId("wallet-kind")).toBeVisible();
      await shot(page, "05-votante-wallet", w);
      await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
      await expect(page.getByRole("button", { name: /enlazar wallet y crear credencial/i })).toBeVisible();
      await shot(page, "06-votante-credencial", w);
      await page.getByRole("button", { name: /enlazar wallet y crear credencial/i }).click();
      await expect(page.getByRole("heading", { name: "Inscripción completa" })).toBeVisible({ timeout: 20_000 });
      await shot(page, "07-votante-inscrito", w);
      mock.phase = "open";
      await page.getByRole("button", { name: /ir a votar/i }).click({ timeout: 15_000 });
      await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
      await page.getByRole("radio", { name: /3$/ }).check();
      await shot(page, "08-votante-boleta", w);
      await page.getByRole("button", { name: /revisar y confirmar/i }).click();
      await page.getByRole("button", { name: /enviar mi voto/i }).click();
      await expect(page.getByTestId("receipt")).toBeVisible({ timeout: 60_000 });
      await shot(page, "09-votante-comprobante", w);
    });

    test(`en vivo ${w}`, async ({ page }) => {
      await at(page, w, "open");
      await page.goto(`/e/${E2E.electionId}/live`);
      await expect(page.getByTestId("phase-timeline")).toBeVisible();
      await expect(page.getByText("Participación").first()).toBeVisible();
      await page.waitForTimeout(400);
      await shot(page, "10-en-vivo", w);
    });

    test(`transparencia verificada ${w}`, async ({ page }) => {
      await at(page, w, "auditable");
      await page.goto(`/e/${E2E.electionId}`);
      await page.getByRole("button", { name: "Verificar ahora" }).click();
      await expect(page.getByTestId("audit-verdict")).toContainText("verificado", { timeout: 30_000 });
      await page.getByLabel("Nullifier").fill(E2E.fixtureNullifier);
      await page.getByRole("button", { name: "Comprobar" }).click();
      await expect(page.getByTestId("my-vote-result")).toBeVisible();
      await shot(page, "11-transparencia-verificar-ahora", w);
    });

    test(`transparencia fallo detectado ${w}`, async ({ page }) => {
      await at(page, w, "auditable", (m) => (m.packageFile = "tampered_total.json"));
      await page.goto(`/e/${E2E.electionId}`);
      await page.getByRole("button", { name: "Verificar ahora" }).click();
      await expect(page.getByTestId("audit-verdict")).toContainText("fallo detectado", { timeout: 30_000 });
      await shot(page, "12-transparencia-fallo-detectado", w);
    });

    test(`sorteo ${w}`, async ({ page }) => {
      await at(page, w, "drawn");
      await page.goto(`/e/${E2E.electionId}/draw`);
      await expect(page.getByTestId("draw-winner")).toHaveCount(2, { timeout: 10_000 });
      await page.getByRole("button", { name: "Recomputar aquí" }).click();
      await expect(page.getByTestId("draw-recompute")).toContainText("Coincide");
      await shot(page, "13-sorteo-recomputado", w);
    });

    test(`organizador ${w}`, async ({ page }) => {
      await at(page, w, "registration");
      await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken]);
      await page.goto(`/org/${E2E.electionId}`);
      await expect(page.getByTestId("org-token")).toBeVisible();
      await expect(page.getByTestId("voters-list")).toBeVisible();
      await shot(page, "14-organizador-panel", w);
    });

    test(`wizard con sorteo ${w}`, async ({ page }) => {
      await at(page, w, "draft");
      await page.goto("/org/new");
      await page.getByLabel("Título de la votación").fill(E2E.title);
      for (let i = 0; i < 2; i++) await page.getByPlaceholder(`Opción ${i + 1}`).fill(String(i + 1));
      for (const c of E2E.candidates.slice(0, 3)) {
        await page.getByLabel("Proyecto").fill(c.label);
        await page.getByLabel("Monto (opcional)").fill(String(c.amount));
        await page.getByRole("button", { name: /agregar proyecto/i }).click();
      }
      await shot(page, "15-organizador-crear-con-sorteo", w);
    });
  });
}
