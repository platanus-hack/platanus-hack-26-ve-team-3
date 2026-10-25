import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1, type Phase } from "./mocks/v1";

/**
 * Capturas del organizador (crear en una pantalla, «¡Listo! Comparte», panel cabina) a 360 / 768 / 1440 px con datos
 * FIXTURE (mocks del contrato v1). Solo con `SCREENSHOTS=1` y en el proyecto chromium:
 *   PORT=3481 SCREENSHOTS=1 pnpm --filter @quorum/web exec playwright test e2e/screenshots.org.spec.ts --project=chromium
 * Salida: docs/screenshots/org/<pantalla>-<ancho>.png
 */
const OUT = path.resolve(__dirname, "../../../docs/screenshots/org");
const WIDTHS = [360, 768, 1440] as const;
const CODE = "K7M3QP";

test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));

async function shot(page: Page, name: string, width: number, fullPage = true) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage, animations: "disabled" });
}

async function at(page: Page, width: number, phase: Phase, setup?: (m: MockV1) => void) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
  const mock = new MockV1(phase);
  setup?.(mock);
  await mock.install(page);
  return mock;
}

/** Token en la pestaña y ya revelado (como al volver al panel después de «Listo»): «Más» queda cerrado. */
const withToken = (page: Page) =>
  page.addInitScript(([id, t]) => {
    sessionStorage.setItem(`quorum.orgToken.${id}`, t);
    sessionStorage.setItem(`quorum.orgToken.shown.${id}`, "1");
  }, [E2E.electionId, E2E.orgToken] as const);

function liveRoom(m: MockV1, seats = 27) {
  m.eligibility = { method: "event-badge", badgeCheck: "live", badgeUrlPrefix: "https://hack.platan.us/26-ve/id/" };
  const ends = new Date(Date.now() + 12 * 60_000 + 48_000).toISOString();
  m.room = { code: CODE, open: true, seatsTaken: seats, maxSeats: 60, expiresAt: ends, closedReason: null };
  m.votingStartsAt = ends;
}

for (const w of WIDTHS) {
  test.describe(`organizador ${w}px`, () => {
    test(`crear vacía ${w}`, async ({ page }) => {
      await at(page, w, "draft");
      await page.goto("/org/new");
      await expect(page.getByTestId("publish")).toBeVisible();
      await shot(page, "crear-vacia", w, false);
    });

    test(`crear llena ${w}`, async ({ page }) => {
      await at(page, w, "draft");
      await page.goto("/org/new");
      await page.getByLabel("Pregunta de la votación").fill("Próxima hackathon (ficticia): ¿cuántas mejoras del espacio financia el fondo simulado? (1 a 5)");
      await page.getByRole("button", { name: "1 a 5" }).click();
      await expect(page.getByTestId("publish-summary")).toContainText("5 opciones");
      await shot(page, "crear-llena", w, w >= 1024);
    });

    test(`listo ${w}`, async ({ page }) => {
      await at(page, w, "registration", (m) => liveRoom(m, 0));
      await page.addInitScript(([id, t]) => {
        if (!sessionStorage.getItem("seeded")) {
          sessionStorage.setItem(`quorum.orgToken.${id}`, t);
          sessionStorage.setItem("seeded", "1");
        }
      }, [E2E.electionId, E2E.orgToken] as const);
      await page.goto(`/org/${E2E.electionId}/listo`);
      await expect(page.getByTestId("room-code")).toHaveText(CODE);
      await expect(page.getByTestId("ready-start-countdown")).toContainText("a las");
      await shot(page, "listo", w);
    });

    test(`panel inscripción ${w}`, async ({ page }) => {
      await at(page, w, "registration", (m) => {
        liveRoom(m);
        m.review = "pending";
      });
      await withToken(page);
      await page.goto(`/org/${E2E.electionId}`);
      await expect(page.getByTestId("room-code")).toHaveText(CODE);
      await expect(page.getByTestId("reviews-badge")).toBeVisible();
      await shot(page, "panel-inscripcion", w);
    });

    test(`panel votación ${w}`, async ({ page }) => {
      await at(page, w, "open", (m) => {
        m.endsAt = new Date(Date.now() + 97 * 60_000 + 5_000).toISOString();
        m.votingStartsAt = new Date(Date.now() - 23 * 60_000).toISOString();
      });
      await withToken(page);
      await page.goto(`/org/${E2E.electionId}`);
      await expect(page.getByTestId("panel-options")).toBeVisible(); // sin resultados en la cabina mientras se vota
      await expect(page.getByTestId("org-turnout")).toContainText("7");
      await shot(page, "panel-votacion", w);
    });
  });
}

test("crear: hoja Avanzado 360", async ({ page }) => {
  await at(page, 360, "draft");
  await page.goto("/org/new");
  await page.getByRole("button", { name: "Ajustes avanzados" }).click();
  await expect(page.getByTestId("advanced-sheet")).toBeVisible();
  await shot(page, "crear-avanzado", 360, false);
});

test("crear: hoja Duración 360", async ({ page }) => {
  await at(page, 360, "draft");
  await page.goto("/org/new");
  await page.getByTestId("duration-segment").click();
  await expect(page.getByTestId("duration-sheet")).toBeVisible();
  await shot(page, "crear-duracion", 360, false);
});

test("panel: Más abierto con casos 360", async ({ page }) => {
  await at(page, 360, "registration", (m) => {
    liveRoom(m);
    m.review = "pending";
  });
  await withToken(page);
  await page.goto(`/org/${E2E.electionId}`);
  await page.getByTestId("reviews-badge").click();
  await expect(page.getByTestId("reviews-card").getByTestId("review-item")).toBeVisible();
  await shot(page, "panel-mas-casos", 360);
});

test("panel: votación con menos de 2 votos 360", async ({ page }) => {
  await at(page, 360, "open", (m) => {
    m.endsAt = new Date(Date.now() + 97 * 60_000).toISOString();
    m.votingStartsAt = new Date(Date.now() - 23 * 60_000).toISOString();
  });
  await page.route(`**/api/elections/${E2E.electionId}/tally`, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ electionId: E2E.electionId, turnout: 1 / 9, totalVotes: 1, eligible: 9, leadingShare: null, closesAt: "2026-10-24T22:00:00.000Z", status: "open", options: E2E.options.map((o) => ({ ...o, count: null })) }) }),
  );
  await withToken(page);
  await page.goto(`/org/${E2E.electionId}`);
  await expect(page.getByTestId("panel-options")).toBeVisible();
  await expect(page.getByTestId("live-breakdown")).toHaveCount(0);
  await shot(page, "panel-votacion-pocos", 360);
});
