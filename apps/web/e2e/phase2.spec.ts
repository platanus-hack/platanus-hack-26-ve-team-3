import { expect, test } from "@playwright/test";
import { E2E, fixtureAudit, MockV1 } from "./mocks/v1";

/**
 * Fase 2 (UI) contra MOCKS del contrato v1 (e2e/mocks/v1.ts). Lo criptográfico es real:
 * - la prueba Semaphore se genera en el navegador con /zk/semaphore-10.{wasm,zkey};
 * - "Verificar ahora" ejecuta @quorum/verifier en el navegador sobre paquetes fixture con pruebas Groth16 reales.
 * Requiere el servidor con NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1 (Playwright no tiene cámara; ver playwright.config.ts).
 */

test.describe("fase 2 · votante", () => {
  test("inscripción en 2 pasos (consentimiento → rostro → vinculación en segundo plano) y voto en 1 pantalla con prueba generada en el navegador", async ({ page }) => {
    test.setTimeout(90_000);
    const mock = new MockV1("registration");
    await mock.install(page);

    await page.goto(`/v/${E2E.token}`);
    await expect(page.getByRole("heading", { name: E2E.title })).toBeVisible();
    await expect(page.getByTestId("step-indicator")).toContainText("Paso 1 de 2");
    await page.getByRole("button", { name: "Continuar" }).click();

    // Paso 2: el rostro simulado (sólo E2E) pasa SOLO, sin botón visible; la vinculación corre en segundo plano.
    await expect(page.getByTestId("e2e-fake-face")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "En espera para iniciar la votación" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("waiting-enrolled")).toContainText("Ya estás inscrito");
    await expect(page.getByText(/Continuar sin/)).toHaveCount(0); // B3: no hay ruta sin rostro
    expect(mock.wallet?.kind).toBe("eoa-demo");
    expect(mock.wallet?.bindingSignature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(mock.commitment).toMatch(/^\d+$/);
    // La clave privada Semaphore nunca sale del navegador: sólo está cifrada en localStorage (clave del dispositivo en IndexedDB).
    const vault = await page.evaluate((id) => localStorage.getItem(`quorum.identity.${id}`), E2E.electionId);
    expect(vault).toContain(mock.commitment!);
    expect(JSON.parse(vault!).v).toBe(3);
    // Sin jerga en el flujo del votante: ni "Detalles técnicos" ni la etiqueta del modo de vinculación (viven en /e/[id]).
    await expect(page.getByText("Detalles técnicos")).toHaveCount(0);
    await expect(page.getByTestId("link-mode")).toHaveCount(0);
    // Sin hora programada en este mock: lo dice, sin cuenta regresiva.
    await expect(page.getByTestId("voting-countdown")).toContainText("Esperando que el organizador abra la votación…");

    // El organizador congela el padrón: la página pasa SOLA a la boleta (polling de 5 s), sin volver a la wallet.
    mock.phase = "open";
    await page.getByRole("radio", { name: /3$/ }).click({ timeout: 15_000 });
    await page.getByRole("button", { name: "Votar: 3" }).click();

    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible();
    const nullifier = (await page.getByTestId("receipt-inclusion-id").textContent())?.trim();
    expect(nullifier).toBe(mock.nullifier);
    // Comprobante simple: hora, "Código de tu comprobante", "Comprobar mi voto" y "Ver resultados"; sin detalles técnicos.
    await expect(receipt).toContainText("Código de tu comprobante");
    await expect(page.getByTestId("receipt-time")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver resultados" })).toBeVisible();
    await expect(page.getByTestId("tech-details")).toHaveCount(0);
    // El voto va sólo con la prueba (sin onchain ni datos del votante) y "ya voté" en otra petición.
    expect(Object.keys(mock.voteBodies[0] as object)).toEqual(["proof"]);
    expect((mock.voteBodies[0] as { proof: { message: string } }).proof.message).toBe("2");
    await expect.poll(() => mock.votedMarked).toBe(true);
    await expect(receipt).not.toContainText("opción elegida");

    // "Comprobar mi voto": consulta por nullifier sin pedir otro toque.
    await page.getByRole("link", { name: "Comprobar mi voto" }).click();
    await expect(page.getByLabel("Código del comprobante")).toHaveValue(nullifier!);
    await expect(page.getByTestId("my-vote-result")).toContainText("incluido");
  });

  test("rostro duplicado → mensaje simple y modo observador", async ({ page }) => {
    const mock = new MockV1("registration");
    mock.faceDuplicate = true;
    await mock.install(page);
    await page.goto(`/v/${E2E.token}`);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByTestId("face-error")).toContainText("Este rostro ya está inscrito en esta votación.");
    await page.getByRole("button", { name: "Solo quiero mirar" }).click();
    await expect(page.getByTestId("observer-mode")).toBeVisible();
    expect(mock.wallet).toBeNull();
  });

  test("sin permiso de cámara → instrucciones por sistema, Intentar de nuevo y Solo quiero mirar", async ({ page, isMobile }) => {
    const mock = new MockV1("registration");
    await mock.install(page);
    await page.addInitScript(() => {
      sessionStorage.setItem("quorum.e2e.realFace", "1"); // pipeline real (sin rostro simulado automático)
      Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => Promise.reject(new DOMException("denegado", "NotAllowedError")) } });
    });
    await page.goto(`/v/${E2E.token}`);
    await page.getByRole("button", { name: "Continuar" }).click();
    const err = page.getByTestId("face-error");
    await expect(err).toContainText("No pudimos usar la cámara", { timeout: 60_000 });
    // Instrucciones según el sistema: en el Pixel 5 emulado sólo Android; en escritorio, ambas.
    await expect(page.getByTestId("camera-help")).toContainText("Android");
    if (isMobile) await expect(page.getByTestId("camera-help")).not.toContainText("iPhone");
    else await expect(page.getByTestId("camera-help")).toContainText("iPhone");
    await expect(err.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible();
    await err.getByRole("button", { name: "Solo quiero mirar" }).click();
    await expect(page.getByTestId("observer-mode")).toBeVisible();
  });

  test("invitación inexistente: error claro, sin botón de votar", async ({ page }) => {
    await new MockV1("registration").install(page);
    await page.goto("/v/tok-no-existe");
    await expect(page.getByText("No se pudo abrir la invitación")).toBeVisible();
    await expect(page.getByRole("button", { name: /votar|continuar/i })).toHaveCount(0);
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

    await page.getByLabel("Código del comprobante").fill(E2E.fixtureNullifier);
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
    await page.getByRole("button", { name: "Repetir el sorteo aquí" }).click();
    await expect(page.getByTestId("draw-recompute")).toContainText("Coincide");
    await expect(page.getByTestId("draw-recompute")).toContainText("finalHash del paquete de auditoría: coincide");
  });
});

test.describe("fase 2 · organizador", () => {
  test("crear en una pantalla → «Publicar y compartir» (crear + publicar + abrir sala 60/15) → «¡Listo! Comparte» → panel", async ({ page }) => {
    const mock = new MockV1("draft");
    const roomBodies: unknown[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith(`/api/elections/${E2E.electionId}/room`)) roomBodies.push(r.postDataJSON());
    });
    await mock.install(page);
    await page.goto("/org/new");
    await expect(page.locator("[data-site-chrome]").first()).toBeHidden(); // pantalla enfocada, sin la cabecera del sitio
    // Apagado mientras falte algo: el resumen dice qué falta y tocarlo no crea nada.
    const publish = page.getByTestId("publish");
    await expect(publish).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("publish-summary")).toHaveText("Escribe la pregunta para publicar");
    await expect(publish).toBeVisible();
    await publish.click({ force: true }); // apagado (aria-disabled): lleva el foco a lo que falta
    await expect(page.getByLabel("Pregunta de la votación")).toBeFocused();
    await page.getByLabel("Pregunta de la votación").fill(E2E.title);
    await expect(page.getByTestId("publish-summary")).toHaveText("Agrega al menos 2 opciones");
    await page.getByRole("button", { name: "1 a 5" }).click();
    await expect(page.getByRole("button", { name: "1 a 5" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("publish-summary")).toHaveText(/5 opciones\s*2 horas\s*credencial \+ rostro/);
    await expect(publish).toHaveAttribute("aria-disabled", "false");
    expect(mock.createBodies).toHaveLength(0);
    await publish.click();

    await page.waitForURL(`**/org/${E2E.electionId}/listo`);
    const body = mock.createBodies[0] as { kind: string; options: { label: string }[]; votingMode: string; startsAt: string; endsAt: string };
    expect(body.kind).toBe("multiple");
    expect(body.options.map((o) => o.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(body.votingMode).toBe("phased");
    expect(Date.parse(body.endsAt) - Date.parse(body.startsAt)).toBe(2 * 3_600_000); // 2 horas por defecto, desde publicar
    expect(roomBodies).toEqual([{ maxSeats: 60, expiresInMin: 15 }]);
    expect(mock.authSeen.every((h) => h === `Bearer ${E2E.orgToken}`)).toBe(true);

    const ready = page.getByTestId("ready-screen");
    await expect(ready.getByTestId("room-code")).toHaveText("K7M3QP");
    await expect(ready.getByTestId("qr")).toHaveAttribute("data-qr-value", /\/j\/K7M3QP$/);
    await expect(ready.getByTestId("ready-state")).toHaveText(/Inscripción abierta/);
    await expect(page.getByTestId("ready-whatsapp")).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*%2Fj%2FK7M3QP$/);
    await expect(page.getByTestId("ready-start-countdown")).toContainText(/\(en 1[45] min\)/);
    await expect(page.getByTestId("org-token")).toHaveText(E2E.orgToken); // plegado, pero en el DOM
    await expect(page.getByTestId("org-token")).toBeHidden();
    await page.getByText("Guarda tu token de organizador").click();
    await expect(page.getByTestId("org-token")).toBeVisible();
    await page.getByTestId("ready-start-change").click();
    await page.getByTestId("ready-start-in-5").click();
    await expect(page.getByTestId("ready-start-countdown")).toContainText(/\(en [45] min\)/);
    expect(mock.schedules).toEqual([{ inSeconds: 300 }]);

    await page.getByTestId("ready-go-panel").click();
    await page.waitForURL(`**/org/${E2E.electionId}`);
    // Next conserva «Listo» oculto tras navegar: se mira solo dentro de la cabina.
    const cockpit = page.getByTestId("org-cockpit");
    await expect(cockpit.getByTestId("org-phase-pill")).toHaveText("Inscripción abierta");
    await expect(cockpit.getByTestId("room-code")).toHaveText("K7M3QP");
    await expect(cockpit.getByTestId("org-clock")).toContainText(/0[45]:\d\d/);
    await expect(cockpit.getByTestId("org-token")).toHaveCount(0); // ya se mostró en «Listo»
    await expect(cockpit.getByTestId("more-sheet")).not.toHaveAttribute("open", "");
  });

  test("cabina: token mostrado una vez (en «Más › Token») y un botón por fase con Authorization Bearer", async ({ page }) => {
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

    await expect(page.getByTestId("org-phase-pill")).toHaveText("Borrador");
    await expect(page.getByTestId("phase-timeline")).toHaveCount(0); // la cabina no lleva tira de fases
    for (const [label, next] of [
      ["Abrir inscripción", "Inscripción abierta"],
      ["Abrir votación", "Votación en curso"],
      ["Cerrar votación", "Auditable"],
      ["Hacer el sorteo", "Sorteada"],
    ] as const) {
      await page.getByTestId("phase-action").filter({ hasText: label }).click();
      await page.getByRole("button", { name: new RegExp(`^Sí, ${label}`, "i") }).click();
      await expect(page.getByTestId("org-phase-pill")).toHaveText(next);
      if (next === "Votación en curso") await expect(page.getByTestId("live-breakdown")).toContainText("Preliminar");
    }
    expect(mock.authSeen.every((h) => h === `Bearer ${E2E.orgToken}`)).toBe(true);
    await expect(page.getByTestId("voters-list")).toContainText("Vecino Bruno (ficticio)");

    await page.reload();
    await expect(page.getByTestId("org-token")).toHaveCount(0); // se muestra una sola vez
  });
});

/* ---------- En vivo con fotos: tarjetas ordenadas y pantalla de cierre ---------- */

/** PNG de 1×1 (fixture): basta para que el contrato `OptionImage` acepte la opción y la UI pinte `<img>`. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const photoOptions = () => E2E.options.map((o, i) => ({ ...o, subtitle: `Propuesta ${o.label} (ficticia)`, ...(i < 3 ? { image: PNG } : {}) }));

test.describe("fase 2 · en vivo con fotos", () => {
  test("votación abierta (7 votos): tarjetas ordenadas con foto, subtítulo y porcentaje; nunca «verificado»", async ({ page }) => {
    const mock = new MockV1("open");
    mock.options = photoOptions();
    await mock.install(page);
    await page.goto(`/e/${E2E.electionId}/live`);
    const cards = page.getByTestId("ranked-cards").first().getByTestId("ranked-card");
    await expect(cards).toHaveCount(5);
    // Fixture: [1,3,2,1,0] ⇒ 2 (43 %), 3 (29 %), luego 1 y 4 empatadas, 5 al final.
    await expect(cards.nth(0)).toHaveAttribute("data-option-id", "opt-2");
    await expect(cards.nth(1)).toHaveAttribute("data-option-id", "opt-3");
    await expect(cards.nth(4)).toHaveAttribute("data-option-id", "opt-5");
    await expect(cards.nth(0)).toContainText(/43\s?%/);
    await expect(cards.nth(0)).toContainText("Propuesta 2 (ficticia)");
    await expect(page.getByTestId("ranked-cards").first().locator("img")).toHaveCount(3); // 3 con foto, 2 con inicial
    await expect(cards.nth(0).locator("img")).toHaveAttribute("src", PNG);
    await expect(page.getByTestId("winner-screen")).toHaveCount(0);
    await expect(page.getByText(/^verificado$/i)).toHaveCount(0);
  });

  test("al cierre (auditable): pantalla de ganador con la foto de «2», veredicto del verificador y las demás en orden", async ({ page }) => {
    const mock = new MockV1("auditable");
    mock.options = photoOptions();
    mock.auditBody = fixtureAudit(true);
    await mock.install(page);
    await page.goto(`/e/${E2E.electionId}/live`);
    const win = page.getByTestId("winner-screen");
    await expect(win).toHaveAttribute("data-outcome", "winner");
    await expect(page.getByTestId("winner-name")).toHaveText("2");
    await expect(page.getByTestId("winner-share")).toContainText(/43\s?%/);
    await expect(page.getByTestId("winner-verdict")).toContainText("Resultado verificado");
    await expect(win).toContainText("fixture-0.0.0");
    const rest = win.getByTestId("ranked-card");
    await expect(rest).toHaveCount(4);
    await expect(rest.nth(0)).toHaveAttribute("data-option-id", "opt-3");
    await expect(win.getByRole("link", { name: /Comprobar el resultado/ })).toHaveAttribute("href", `/e/${E2E.electionId}`);
  });

  test("al cierre con fallo (failed): «Fallo detectado», sin ganador, enlace a Transparencia", async ({ page }) => {
    const mock = new MockV1("failed");
    mock.options = photoOptions();
    mock.auditBody = fixtureAudit(false);
    await mock.install(page);
    await page.goto(`/e/${E2E.electionId}/live`);
    const win = page.getByTestId("winner-screen");
    await expect(win).toHaveAttribute("data-outcome", "failed");
    await expect(win).toContainText("Fallo detectado");
    await expect(win).not.toContainText(/\bverificado\b/i);
    await expect(page.getByTestId("winner-name")).toHaveCount(0);
    await expect(win.getByRole("link", { name: /Ver en Transparencia/ })).toHaveAttribute("href", `/e/${E2E.electionId}`);
  });
});
