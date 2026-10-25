import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, fixtureAudit, MockV1, type Phase } from "./mocks/v1";

/**
 * Capturas (datos FIXTURE, mocks del contrato v1) de D-23: opciones con foto y subtítulo, entrada del votante sin
 * contador, espera animada, boleta con foto, «Por opción» del panel con tarjetas y /live con tarjetas y ganador.
 *   E2E_PROD=1 PORT=3362 SCREENSHOTS=1 QUORUM_NEXT_DIST_DIR=.next-e2e-foto pnpm exec playwright test e2e/screenshots.fotos.spec.ts --project=chromium
 * Salida: docs/screenshots/fotos/*.png. Las «fotos» son gradientes con un número generados en el navegador (no hay personas).
 */
const OUT = path.resolve(__dirname, "../../../docs/screenshots/fotos");
const CODE = "K7M3QP";
const NAMES = ["Ana (ficticia)", "Beto (ficticio)", "Cris (ficticia)"];
const SUBTITLES = ["Equipo Trust", "Equipo Pagos", "Equipo Salud"];

test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));
test.use({
  viewport: { width: 360, height: 740 },
  locale: "es-VE",
  timezoneId: "America/Caracas",
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage, animations: "disabled" });
}

/** Tres «fotos» JPEG de 192 px hechas con canvas (gradiente + número). */
async function photos(page: Page): Promise<string[]> {
  await page.goto("/");
  return page.evaluate(() => {
    const colors = ["#004466", "#ff714e", "#247a57"];
    return colors.map((c, i) => {
      const cv = document.createElement("canvas");
      cv.width = 192;
      cv.height = 192;
      const ctx = cv.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 192, 192);
      g.addColorStop(0, c);
      g.addColorStop(1, "#111122");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 192, 192);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "bold 96px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), 96, 104);
      return cv.toDataURL("image/jpeg", 0.8);
    });
  });
}

function optionsWithPhotos(imgs: string[]) {
  return NAMES.map((label, i) => ({ id: `opt-${i + 1}`, label, subtitle: SUBTITLES[i]!, image: imgs[i]! }));
}

function tallyOf(mock: MockV1, counts: number[], phase: Phase) {
  const total = counts.reduce((a, b) => a + b, 0);
  mock.tally = () => ({
    electionId: E2E.electionId,
    turnout: total / 9,
    totalVotes: total,
    eligible: 9,
    leadingShare: total ? Math.max(...counts) / total : null,
    closesAt: "2026-10-24T22:00:00.000Z",
    status: phase,
    options: mock.options.map((o, i) => ({ id: o.id, label: o.label, count: total >= 2 ? (counts[i] ?? 0) : null })),
  });
}

test("crear con fotos y subtítulos", async ({ page }) => {
  const imgs = await photos(page);
  const mock = new MockV1("draft");
  await mock.install(page);
  await page.goto("/org/new");
  await page.getByLabel("Pregunta de la votación").fill("Presidente Platanus Vzla [26] (ficticio)");
  await page.getByRole("button", { name: "Agregar opción" }).click();
  for (const [i, letter] of ["A", "B", "C"].entries()) {
    await page.getByLabel(`Opción ${letter}`, { exact: true }).fill(NAMES[i]!);
    await page.getByLabel(`Subtítulo de la opción ${letter}`).fill(SUBTITLES[i]!);
    await page.getByTestId(`option-file-${i}`).setInputFiles({ name: `foto-${i}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(imgs[i]!.split(",")[1]!, "base64") });
  }
  await expect(page.getByRole("button", { name: "Cambiar foto de la opción C" })).toBeVisible();
  await shot(page, "crear-fotos-360");
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "crear-fotos-1440");
});

test("entrada del votante (apodo y credencial)", async ({ page }) => {
  const mock = new MockV1("open");
  mock.continuous = true;
  mock.groupSize = 3;
  mock.room = { code: CODE, open: true, seatsTaken: 3, maxSeats: 500, expiresAt: new Date(Date.now() + 170 * 60_000).toISOString(), closedReason: null };
  await mock.install(page);
  await page.goto(`/j/${CODE}`);
  await expect(page.getByLabel("Tu nombre o apodo")).toBeVisible();
  await shot(page, "entrada-apodo-360");
  mock.eligibility = { method: "event-badge", badgeCheck: "live", badgeUrlPrefix: "https://hack.platan.us/26-ve/id/" };
  await page.goto(`/j/${CODE}`);
  await expect(page.getByTestId("badge-scan")).toBeVisible();
  await shot(page, "entrada-credencial-360");
});

test("espera animada y boleta con fotos (modo continuo)", async ({ page }) => {
  test.setTimeout(120_000);
  const imgs = await photos(page);
  const mock = new MockV1("open");
  mock.continuous = true;
  mock.minAnonymitySet = 2; // D-24: K por defecto
  mock.groupSize = 0; // con ella será 1: falta 1 para K=2
  mock.options = optionsWithPhotos(imgs);
  mock.room = { code: CODE, open: true, seatsTaken: 0, maxSeats: 500, expiresAt: new Date(Date.now() + 170 * 60_000).toISOString(), closedReason: null };
  await mock.install(page);
  await page.goto(`/j/${CODE}`);
  await page.getByLabel("Tu nombre o apodo").fill("Vecina del 4B");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(900); // deja pasar la entrada de la página; las ondas siguen vivas (un fotograma)
  await page.screenshot({ path: path.join(OUT, "espera-360.png") });
  mock.groupSize = 2;
  const options = page.getByRole("radio");
  await expect(options).toHaveCount(3, { timeout: 15_000 });
  await shot(page, "boleta-fotos-360");
  await options.nth(1).click();
  await expect(page.getByRole("button", { name: `Votar: ${NAMES[1]}` })).toBeVisible();
  await shot(page, "boleta-elegida-360");
});

test("panel del organizador: «Por opción» con tarjetas", async ({ page }) => {
  const imgs = await photos(page);
  const mock = new MockV1("open");
  mock.continuous = true;
  mock.groupSize = 9;
  mock.options = optionsWithPhotos(imgs);
  tallyOf(mock, [2, 4, 1], "open");
  mock.room = { code: CODE, open: true, seatsTaken: 9, maxSeats: 500, expiresAt: new Date(Date.now() + 170 * 60_000).toISOString(), closedReason: null };
  await mock.install(page);
  await page.addInitScript(([id, t]) => sessionStorage.setItem(`quorum.orgToken.${id}`, t), [E2E.electionId, E2E.orgToken] as const);
  await page.goto(`/org/${E2E.electionId}`);
  await expect(page.getByTestId("live-breakdown")).toContainText(NAMES[1]!);
  await shot(page, "panel-por-opcion-360", true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "panel-por-opcion-1440");
});

test("en vivo: tarjetas, ganador, empate y fallo detectado", async ({ page }) => {
  const imgs = await photos(page);
  const cases: { name: string; phase: Phase; counts: number[] }[] = [
    { name: "live-tarjetas", phase: "open", counts: [2, 4, 1] },
    { name: "live-ganador", phase: "auditable", counts: [2, 4, 1] },
    { name: "live-empate", phase: "auditable", counts: [3, 3, 1] },
    { name: "live-fallo", phase: "failed", counts: [2, 4, 1] },
  ];
  for (const c of cases) {
    const mock = new MockV1(c.phase);
    mock.options = optionsWithPhotos(imgs);
    tallyOf(mock, c.counts, c.phase);
    if (c.phase !== "open") mock.auditBody = fixtureAudit(c.phase === "auditable");
    await mock.install(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/e/${E2E.electionId}/live`);
    await expect(page.getByText(NAMES[1]!).locator("visible=true").first()).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, `${c.name}-360`, true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await shot(page, `${c.name}-1440`);
  }
});
