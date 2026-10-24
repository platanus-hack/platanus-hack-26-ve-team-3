import { expect, test } from "@playwright/test";
import { E2E, MockV1 } from "./mocks/v1";

/**
 * Fase 2 (UI) contra MOCKS del contrato v1 (e2e/mocks/v1.ts). Lo criptográfico es real:
 * - la prueba Semaphore se genera en el navegador con /zk/semaphore-10.{wasm,zkey};
 * - "Verificar ahora" ejecuta @quorum/verifier en el navegador sobre paquetes fixture con pruebas Groth16 reales.
 * Requiere el servidor con NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1 (Playwright no tiene cámara; ver playwright.config.ts).
 */

test.describe("fase 2 · votante", () => {
  test("inscripción (rostro → wallet → credencial) y voto con prueba generada en el navegador", async ({ page }) => {
    test.setTimeout(90_000);
    const mock = new MockV1("registration");
    await mock.install(page);

    await page.goto(`/v/${E2E.token}`);
    await expect(page.getByRole("heading", { name: E2E.title })).toBeVisible();
    await expect(page.getByTestId("phase-timeline")).toContainText("Inscripción abierta");
    await page.getByRole("button", { name: "Inscribirme" }).click();

    await page.getByLabel("Nombre").fill("Vecina Ana (ficticia)");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /continuar a la prueba de vida/i }).click();
    await expect(page.getByText("modo demo · no certificada")).toBeVisible();
    await expect(page.getByText(/Continuar sin/)).toHaveCount(0); // B3: no hay ruta sin rostro
    await page.getByTestId("e2e-fake-face").click();

    await expect(page.getByTestId("wallet-kind")).toContainText(/demo/i);
    await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
    await page.getByRole("button", { name: /enlazar wallet y crear credencial/i }).click();
    await expect(page.getByRole("heading", { name: "Inscripción completa" })).toBeVisible({ timeout: 20_000 });
    expect(mock.wallet?.kind).toBe("eoa-demo");
    expect(mock.wallet?.bindingSignature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(mock.commitment).toMatch(/^\d+$/);
    // La clave privada Semaphore nunca sale del navegador: sólo está cifrada en localStorage.
    const vault = await page.evaluate((id) => localStorage.getItem(`quorum.identity.${id}`), E2E.electionId);
    expect(vault).toContain(mock.commitment!);

    // El organizador congela el padrón: la página detecta la apertura (polling de 5 s).
    mock.phase = "open";
    await page.getByRole("button", { name: /ir a votar/i }).click({ timeout: 15_000 });
    await page.getByRole("button", { name: /crear wallet y firmar/i }).click();
    await page.getByRole("radio", { name: /3$/ }).check();
    await page.getByRole("button", { name: /revisar y confirmar/i }).click();
    await page.getByRole("button", { name: /enviar mi voto/i }).click();

    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible({ timeout: 60_000 });
    await expect(receipt).toContainText("incluido");
    const nullifier = (await page.getByTestId("receipt-inclusion-id").textContent())?.trim();
    expect(nullifier).toBe(mock.nullifier);
    // El voto va sólo con la prueba (sin onchain ni datos del votante) y "ya voté" en otra petición.
    expect(Object.keys(mock.voteBodies[0] as object)).toEqual(["proof"]);
    expect((mock.voteBodies[0] as { proof: { message: string } }).proof.message).toBe("2");
    await expect.poll(() => mock.votedMarked).toBe(true);
    await expect(receipt).not.toContainText("opción elegida");

    // "Mi voto está" durante la votación: consulta por nullifier.
    await page.goto(`/e/${E2E.electionId}#mi-voto`);
    await expect(page.getByLabel("Nullifier")).toHaveValue(nullifier!);
    await page.getByRole("button", { name: "Comprobar" }).click();
    await expect(page.getByTestId("my-vote-result")).toContainText("incluido");
  });

  test("invitación inexistente: error claro, sin botón de votar", async ({ page }) => {
    await new MockV1("registration").install(page);
    await page.goto("/v/tok-no-existe");
    await expect(page.getByText("No se pudo abrir la invitación")).toBeVisible();
    await expect(page.getByRole("button", { name: /votar|inscribirme/i })).toHaveCount(0);
  });
});

test.describe("fase 2 · transparencia y sorteo", () => {
  test("Verificar ahora corre el verificador en el navegador: íntegro ⇒ verificado (parcial, ancla no evaluada)", async ({ page }) => {
    const mock = new MockV1("auditable");
    await mock.install(page);
    await page.goto(`/e/${E2E.electionId}`);
    await page.getByRole("button", { name: "Verificar ahora" }).click();
    const verdict = page.getByTestId("audit-verdict");
    await expect(verdict).toContainText("verificado", { timeout: 30_000 });
    await expect(verdict).toContainText("no verificable");
    await expect(page.getByText(/Verificación parcial/)).toBeVisible();
    await expect(page.getByTestId("input-artifact-digest")).toHaveAttribute("title", /^sha256:[0-9a-f]{64}$/);
    await expect(page.getByTestId("verifier-version")).toContainText("quorum-verifier");

    await page.getByLabel("Nullifier").fill(E2E.fixtureNullifier);
    await page.getByRole("button", { name: "Comprobar" }).click();
    await expect(page.getByTestId("my-vote-result")).toContainText("paquete que verificaste");
  });

  test("paquete con total alterado ⇒ fallo detectado con la causa", async ({ page }) => {
    const mock = new MockV1("auditable");
    mock.packageFile = "tampered_total.json";
    await mock.install(page);
    await page.goto(`/e/${E2E.electionId}`);
    await page.getByRole("button", { name: "Verificar ahora" }).click();
    await expect(page.getByTestId("audit-verdict")).toContainText("fallo detectado", { timeout: 30_000 });
    await expect(page.getByText(/publicado 2, recomputado 1/).first()).toBeVisible();
  });

  test("sorteo: Recomputar aquí coincide con lo publicado", async ({ page }) => {
    await new MockV1("drawn").install(page);
    await page.goto(`/e/${E2E.electionId}/draw`);
    await expect(page.getByTestId("draw-winner")).toHaveCount(2, { timeout: 10_000 });
    await page.getByRole("button", { name: "Recomputar aquí" }).click();
    await expect(page.getByTestId("draw-recompute")).toContainText("Coincide");
    await expect(page.getByTestId("draw-recompute")).toContainText("finalHash del paquete de auditoría: coincide");
  });
});

test.describe("fase 2 · organizador", () => {
  test("token mostrado una vez y un botón por fase con Authorization Bearer", async ({ page }) => {
    const mock = new MockV1("draft");
    await mock.install(page);
    await page.addInitScript(([id, t]) => {
      if (!sessionStorage.getItem("quorum.e2e.seeded")) {
        sessionStorage.setItem(`quorum.orgToken.${id}`, t);
        sessionStorage.setItem("quorum.e2e.seeded", "1");
      }
    }, [E2E.electionId, E2E.orgToken]);
    await page.goto(`/org/${E2E.electionId}`);
    await expect(page.getByTestId("org-token")).toHaveText(E2E.orgToken);
    await expect(page.getByTestId("candidates-list")).toContainText("Huerto comunitario");

    for (const [label, next] of [
      ["Abrir inscripción", "Inscripción abierta"],
      ["Congelar padrón y abrir votación", "Votación abierta"],
      ["Cerrar votación", "Auditable"],
      ["Realizar sorteo verificable", "Sorteo realizado"],
    ] as const) {
      await page.getByTestId("phase-action").filter({ hasText: label }).click();
      await page.getByRole("button", { name: new RegExp(`^Sí, ${label}`, "i") }).click();
      await expect(page.getByTestId("phase-timeline")).toContainText(next);
    }
    expect(mock.authSeen.every((h) => h === `Bearer ${E2E.orgToken}`)).toBe(true);
    await expect(page.getByTestId("voters-list")).toContainText("Vecino Bruno (ficticio)");

    await page.reload();
    await expect(page.getByTestId("org-token")).toHaveCount(0); // se muestra una sola vez
  });
});
