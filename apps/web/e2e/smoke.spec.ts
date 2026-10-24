import { expect, test } from "@playwright/test";

/**
 * Smoke: prueba que Playwright + webServer (`pnpm dev`) funcionan de verdad.
 * Corre en los dos proyectos (chromium escritorio y mobile-360).
 */
test.describe("smoke", () => {
  test("la portada responde 200 y tiene un h1", async ({ page }) => {
    const response = await page.goto("/");
    expect(response, "la navegación devuelve respuesta").not.toBeNull();
    expect(response!.status()).toBe(200);

    const h1 = page.locator("h1");
    await expect(h1.first()).toBeVisible();
    expect(await h1.count()).toBeGreaterThanOrEqual(1);
  });

  test("el documento declara idioma (base de accesibilidad)", async ({ page }) => {
    await page.goto("/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang, "<html lang> presente").toBeTruthy();
  });
});
