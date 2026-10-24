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

  test("fase 2: los artefactos Groth16 se sirven desde /zk", async ({ request }) => {
    for (const f of ["semaphore-10.wasm", "semaphore-10.zkey"]) {
      const res = await request.head(`/zk/${f}`);
      expect(res.status(), f).toBe(200);
    }
  });

  test("fase 2: el centro de transparencia del paquete fixture responde y ofrece Verificar ahora", async ({ page }) => {
    await page.goto("/e/fixture-condominio-2026");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Verificar ahora" })).toBeVisible();
  });
});
