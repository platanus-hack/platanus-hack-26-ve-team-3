import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";

/**
 * Laboratorio del jurado (`/audit/lab`) y auditor (`/audit`) con el verificador REAL corriendo en el navegador
 * sobre el paquete fixture v1 `semaphore-ledger` (3 boletas con pruebas Groth16 reales y sorteo realizado: lab-drawn.json).
 *   PORT=<puerto libre> pnpm --filter @quorum/web exec playwright test e2e/lab.spec.ts
 * Capturas: SCREENSHOTS=1 … --project=chromium  →  docs/screenshots/phase2/lab-*.png (360 y 1440).
 */

/** Tabla del guion: alteración → checks que deben fallar SIN ancla (lista vacía = no detectable). */
const TABLE: { id: string; none: string[]; sim: string[] }[] = [
  { id: "ballot-message", none: ["proofs_valid"], sim: ["proofs_valid", "anchor_matches"] },
  { id: "ledger-reorder", none: ["chain_integrity"], sim: ["chain_integrity"] },
  { id: "nullifier-dup", none: ["nullifiers_unique"], sim: ["nullifiers_unique", "anchor_matches"] },
  { id: "tally-inflate", none: ["tally_matches"], sim: ["tally_matches", "anchor_matches"] },
  { id: "group-root", none: ["group_root"], sim: ["group_root", "anchor_matches"] },
  { id: "roll-insert", none: ["group_root"], sim: ["group_root"] },
  { id: "final-hash", none: ["chain_integrity"], sim: ["chain_integrity", "anchor_matches"] },
  { id: "drop-raw", none: ["chain_integrity", "tally_matches"], sim: ["chain_integrity", "tally_matches"] },
  { id: "drop-rechain", none: [], sim: ["anchor_matches"] },
  { id: "draw-seed", none: ["draw_matches"], sim: ["draw_matches"] },
  { id: "draw-winner", none: ["draw_matches"], sim: ["draw_matches"] },
  { id: "ledger-extra-field", none: ["package_schema"], sim: ["package_schema"] },
];

async function openLab(page: Page, query = "") {
  await page.goto(`/audit/lab${query}`);
  await expect(page.getByTestId("baseline-status")).toContainText("verificado", { timeout: 30_000 });
}

async function tamper(page: Page, id: string) {
  const button = page.getByTestId(`alt-${id}`);
  if (!(await button.isVisible())) await page.getByTestId("more-alterations").locator("summary").click();
  await button.click();
  const result = page.getByTestId("lab-result");
  await expect(result).toHaveAttribute("data-alteration", id, { timeout: 30_000 });
  await expect(page.getByTestId(`alt-${id}`)).toBeEnabled({ timeout: 30_000 });
  return result;
}

async function expectFailed(page: Page, checks: string[]) {
  const result = page.getByTestId("lab-result");
  for (const c of checks) await expect(result.locator(`[data-check="${c}"]`)).toHaveAttribute("data-status", "fallo detectado");
}

test.describe("laboratorio del jurado · cada alteración hace fallar el check esperado", () => {
  test("sin ancla", async ({ page }) => {
    test.setTimeout(180_000);
    await openLab(page);
    for (const row of TABLE) {
      const result = await tamper(page, row.id);
      if (row.none.length === 0) {
        await expect(result).toHaveAttribute("data-verdict", "no-detectable");
        await expect(page.getByTestId("verdict-banner")).toHaveAttribute("data-status", "verificado");
        await expect(page.getByTestId("lab-evaluation")).toContainText("Sin ancla");
      } else {
        await expect(result).toHaveAttribute("data-verdict", "detectado");
        await expect(page.getByTestId("verdict-banner")).toHaveAttribute("data-status", "fallo detectado");
        await expect(page.getByTestId("verdict-banner")).toContainText(/fallo detectado/i);
        await expectFailed(page, row.none);
        await expect(page.getByTestId("alteration-diff")).toBeVisible();
      }
    }
  });

  test("con ancla simulada (etiquetada simulación): quitar un voto y rehacer todo SÍ se detecta", async ({ page }) => {
    test.setTimeout(180_000);
    await openLab(page);
    await page.getByRole("radio", { name: /Ancla simulada/ }).check();
    await expect(page.getByTestId("baseline-status")).toContainText("verificado", { timeout: 30_000 });
    for (const row of TABLE) {
      const result = await tamper(page, row.id);
      await expect(result).toHaveAttribute("data-verdict", "detectado");
      await expectFailed(page, row.sim);
    }
  });

  test("censo abierto: sin `rollPolicy` en el paquete «ocultar la sala» se ofrece deshabilitada con el motivo", async ({ page }) => {
    await openLab(page);
    await expect(page.getByTestId("alt-room-hide")).toBeDisabled();
    await expect(page.getByTestId("alt-room-hide")).toContainText("censo abierto");
  });

  test("paquete real por id (contrato v1 simulado con mocks) y el original no cambia", async ({ page }) => {
    const mock = new MockV1("auditable");
    await mock.install(page);
    await openLab(page, `?id=${E2E.electionId}`);
    await expect(page.getByText(`Paquete publicado de la elección ${E2E.electionId}`)).toBeVisible();
    await tamper(page, "tally-inflate");
    await expectFailed(page, ["tally_matches"]);
    await expect(page.getByTestId("baseline-status")).toContainText("verificado");
  });
});

test.describe("compartir alteración → el público la verifica en su teléfono", () => {
  test("la receta (QR) reproduce la misma copia, con la misma huella, y el teléfono ve FALLO DETECTADO", async ({ page, context }) => {
    test.setTimeout(120_000);
    await openLab(page);
    await tamper(page, "tally-inflate");
    await page.getByTestId("share-open").click();
    await expect(page.getByRole("img", { name: /Código QR/ }).locator("svg")).toBeVisible();
    const href = await page.getByTestId("share-recipe-url").getAttribute("href");
    expect(href).toMatch(/\/audit\?fixture=1&alt=tally-inflate&anc=none&d=[0-9a-f]{16}$/);

    const phone = await context.newPage();
    await phone.goto(href!);
    await expect(phone.getByText("Es la misma copia que alteró el jurado")).toBeVisible({ timeout: 30_000 });
    await phone.getByTestId("verify-button").click();
    const banner = phone.getByTestId("verdict-banner");
    await expect(banner).toHaveAttribute("data-status", "fallo detectado", { timeout: 30_000 });
    await expect(banner).toContainText("tally_matches");
    await expect(phone.locator('[data-check="tally_matches"]')).toHaveAttribute("data-status", "fallo detectado");
    await expect(phone.getByTestId("verifier-version")).toContainText("quorum-verifier");
  });

  test("enlace autónomo (#pkg=): la copia viaja dentro del enlace", async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await openLab(page);
    await tamper(page, "nullifier-dup");
    await page.getByTestId("share-open").click();
    await page.getByTestId("share-more").locator("summary").click();
    await page.getByTestId("share-embedded").click();
    const url = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    test.skip(!url.includes("#"), "portapapeles no disponible en este navegador");
    const phone = await context.newPage();
    await phone.goto(url);
    await phone.getByTestId("verify-button").click();
    await expect(phone.getByTestId("verdict-banner")).toHaveAttribute("data-status", "fallo detectado", { timeout: 30_000 });
    await expect(phone.locator('[data-check="nullifiers_unique"]')).toHaveAttribute("data-status", "fallo detectado");
  });
});

test.describe("/audit · auditor independiente", () => {
  test("paquete íntegro por id: método, versión, hash de entrada y garantías no evaluadas", async ({ page }) => {
    const mock = new MockV1("auditable");
    await mock.install(page);
    await page.goto(`/audit?id=${E2E.electionId}`);
    await expect(page.getByTestId("input-sha256")).toHaveText(/^sha256:[0-9a-f]{64}$/, { timeout: 30_000 });
    await page.getByTestId("verify-button").click();
    await expect(page.getByTestId("verdict-banner")).toHaveAttribute("data-status", "verificado", { timeout: 30_000 });
    await expect(page.getByText("semaphore-ledger").first()).toBeVisible();
    await expect(page.getByTestId("input-artifact-digest")).toHaveAttribute("title", await page.getByTestId("input-sha256").innerText());
    await expect(page.getByText("Propiedades no evaluadas")).toBeVisible();
  });

  test("JSON pegado: sin forma de paquete ⇒ no verificable (no es evidencia de manipulación); paquete con campo extra ⇒ fallo; JSON ilegible ⇒ no verificable; nunca verde", async ({ page }) => {
    await page.goto("/audit");
    await page.getByText("Otras formas").click();
    await page.getByText("Pegar el JSON del paquete").click();
    await page.getByLabel("JSON del paquete").fill('{"hola":"mundo"}');
    await page.getByRole("button", { name: "Usar este JSON" }).click();
    await page.getByTestId("verify-button").click();
    const banner = page.getByTestId("verdict-banner");
    await expect(banner).toHaveAttribute("data-status", "no verificable", { timeout: 30_000 });
    await expect(page.locator('[data-check="package_schema"]')).toHaveAttribute("data-status", "no verificable");
    // Un paquete quorum-audit/1 con un campo no declarado en la raíz SÍ es fallo detectado (esquema estricto).
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "../public/fixtures/protocol/lab-drawn.json"), "utf8")) as Record<string, unknown>;
    await page.getByLabel("JSON del paquete").fill(JSON.stringify({ ...pkg, notaOculta: "x" }));
    await page.getByRole("button", { name: "Usar este JSON" }).click();
    await page.getByTestId("verify-button").click();
    await expect(banner).toHaveAttribute("data-status", "fallo detectado", { timeout: 30_000 });
    await expect(page.locator('[data-check="package_schema"]')).toHaveAttribute("data-status", "fallo detectado");
    await page.getByLabel("JSON del paquete").fill("esto no es json");
    await page.getByRole("button", { name: "Usar este JSON" }).click();
    await page.getByTestId("verify-button").click();
    await expect(banner).toHaveAttribute("data-status", "no verificable", { timeout: 30_000 });
  });

  test("360 px: sin scroll horizontal en el laboratorio ni en el auditor", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openLab(page);
    await tamper(page, "tally-inflate");
    await page.getByTestId("share-open").click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.goto("/audit?fixture=1");
    await page.getByTestId("verify-button").click();
    await expect(page.getByTestId("verdict-banner")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

// ---------------- capturas ----------------
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
test.describe("capturas del laboratorio", () => {
  test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
  test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));
  const shot = async (page: Page, name: string, w: number) => {
    await page.evaluate(() => document.fonts?.ready);
    await page.screenshot({ path: path.join(OUT, `lab-${name}-${w}.png`), fullPage: true, animations: "disabled" });
  };
  for (const w of [360, 1440]) {
    test(`laboratorio y auditor ${w}`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 });
      await openLab(page);
      await shot(page, "01-inicio", w);
      await tamper(page, "tally-inflate");
      await shot(page, "02-fallo-detectado", w);
      await page.getByTestId("share-open").click();
      await expect(page.getByRole("img", { name: /Código QR/ }).locator("svg")).toBeVisible();
      await page.getByTestId("share-panel").scrollIntoViewIfNeeded();
      await shot(page, "03-compartir-qr", w);
      const href = await page.getByTestId("share-recipe-url").getAttribute("href");
      await tamper(page, "drop-rechain");
      await shot(page, "04-quitar-voto-sin-ancla", w);
      await page.getByRole("radio", { name: /Ancla simulada/ }).check();
      await expect(page.getByTestId("lab-result")).toHaveAttribute("data-verdict", "detectado", { timeout: 30_000 });
      await shot(page, "05-quitar-voto-con-ancla", w);
      const phone = await context.newPage();
      await phone.setViewportSize({ width: w, height: w < 768 ? 800 : 900 });
      await phone.goto(href!);
      await phone.getByTestId("verify-button").click();
      await expect(phone.getByTestId("verdict-banner")).toHaveAttribute("data-status", "fallo detectado", { timeout: 30_000 });
      await shot(phone, "06-audit-copia-del-jurado", w);
    });
  }
});
