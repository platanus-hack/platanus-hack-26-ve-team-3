// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditResult } from "@quorum/contracts";
import { AuditChecklist, checkStatus, overallStatus } from "@/components/AuditChecklist";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import { buildSteps, judgeInclusion, MyVoteCheck, STEP_MS } from "@/components/election/MyVoteCheck";
import { buildVerifySteps, VerifyNowPanel } from "@/components/election/VerifyNowPanel";
import { apiV1 } from "@/lib/client/apiV1";
import { anchorCheckOf } from "@/lib/client/onchain";
import { CandidatesEditor, candidateId } from "@/components/org/CandidatesEditor";
import { BallotScreen } from "@/components/voter/BallotScreen";
import { VoteReceiptCard } from "@/components/voter/VoteReceiptCard";
import { WAITING_TITLE, WaitingPulse, waitingContinuousText } from "@/components/voter/WaitingPulse";
import { verifyPackageInBrowser } from "@/lib/client/zk";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(cleanup);

const WEB = path.resolve(__dirname, "../../..");
const fixture = (f: string) => new Uint8Array(readFileSync(path.join(WEB, "public/fixtures/protocol", f)));

async function realResult(f: string): Promise<AuditResult> {
  const out = await verifyPackageInBrowser(fixture(f));
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

describe("PhaseTimeline", () => {
  it("marca la fase actual con aria-current y texto, no sólo color", () => {
    render(<PhaseTimeline phase="open" />);
    const current = screen.getByText("Votación").closest("li");
    expect(current?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("Fase actual:").textContent).toContain("Votación abierta");
    expect(screen.getAllByText("(completada)", { exact: false })).toHaveLength(1);
  });

  it("sin candidatos no hay paso «Sorteo» (4 de 4 en auditable); con candidatos sí (5 de 6 y «Sorteo» visible)", () => {
    render(<PhaseTimeline phase="auditable" />);
    expect(screen.queryByText("Sorteo")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByTestId("phase-timeline").textContent).toContain("5 de 5");
    cleanup();
    render(<PhaseTimeline phase="auditable" continuous />);
    expect(screen.queryByText("Sorteo")).toBeNull();
    expect(screen.getByTestId("phase-timeline").textContent).toContain("4 de 4");
    cleanup();
    render(<PhaseTimeline phase="auditable" hasDraw />);
    expect(screen.getByText("Sorteo")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByTestId("phase-timeline").textContent).toContain("5 de 6");
    cleanup();
    // `drawn` con sorteo: último paso actual; sin paso «Sorteo» no se sale de la línea (se queda en Resultado).
    render(<PhaseTimeline phase="drawn" hasDraw />);
    expect(screen.getByText("Sorteo").closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("failed se muestra como fallo con texto", () => {
    render(<PhaseTimeline phase="failed" />);
    expect(screen.getByText("(falló la verificación)", { exact: false })).toBeTruthy();
  });
});

describe("AuditChecklist con salidas REALES del verificador", () => {
  it("paquete íntegro sin ancla: 'verificado' + 'no verificable' parcial; el ancla no se pinta verde (M2)", async () => {
    const r = await realResult("valid.json");
    expect(overallStatus(r)).toBe("verificado");
    expect(checkStatus(r.checks.find((c) => c.name === "anchor_matches")!)).toBe("no verificable");
    render(<AuditChecklist result={r} runtime="navegador" />);
    const verdict = screen.getByTestId("audit-verdict");
    expect(verdict.textContent).toContain("verificado");
    expect(verdict.textContent).toContain("no verificable");
    expect(screen.getByText(/Verificación parcial/)).toBeTruthy();
    expect(screen.getByTestId("verifier-version").textContent).toMatch(/quorum-verifier/);
    expect(screen.getByTestId("input-artifact-digest").getAttribute("title")).toMatch(/^sha256:[0-9a-f]{64}$/);
  }, 30_000);

  it("«Propiedades no evaluadas» (unsupportedGuarantees) ya no se lista en la UI: sigue en el JSON, nunca se pinta «verificado»", async () => {
    const r = await realResult("valid.json");
    expect(r.unsupportedGuarantees.length).toBeGreaterThan(0);
    render(<AuditChecklist result={r} runtime="navegador" />);
    expect(screen.queryByText(/Propiedades no evaluadas/)).toBeNull();
    // Sólo aparecen (si acaso) dentro del JSON íntegro (<pre>), nunca como lista con pills.
    for (const g of r.unsupportedGuarantees) expect(screen.queryAllByText(g).filter((el) => !el.closest("pre"))).toHaveLength(0);
    // El resumen de comprobaciones (checks, no propiedades) sí se queda; la pill ámbar del veredicto viene del ancla sin RPC.
    expect(screen.getByTestId("checks-summary").textContent).toMatch(/comprobaciones · \d+ verificadas · 1 sin evaluar/);
    expect(screen.getByTestId("audit-verdict").querySelectorAll("span.rounded-full")).toHaveLength(2);
    // El JSON descargable (pre de «Detalles técnicos») conserva el dato íntegro.
    expect(screen.getByText(/"unsupportedGuarantees"/)).toBeTruthy();
  }, 30_000);

  it("sin checks «no evaluado» y con unsupportedGuarantees: veredicto con UNA sola pill (sin «no verificable» por propiedades)", () => {
    const r: AuditResult = { electionId: "el-x", verifierVersion: "quorum-verifier@test", protocol: "semaphore-ledger", inputArtifactDigest: `sha256:${"1a".repeat(32)}`, checkedAt: "2026-10-24T22:01:00.000Z", valid: true, checks: [{ name: "tally_matches", passed: true, status: "verificado" }], unsupportedGuarantees: ["secreto-del-contenido-frente-al-servidor: el servidor ve la opción"] };
    render(<AuditChecklist result={r} />);
    const verdict = screen.getByTestId("audit-verdict");
    expect(verdict.textContent).toContain("verificado");
    expect(verdict.textContent).not.toContain("no verificable");
    expect(screen.queryByText(/Verificación parcial/)).toBeNull();
    expect(screen.queryByText(/Propiedades no evaluadas/)).toBeNull();
    expect(screen.queryAllByText(/secreto-del-contenido-frente-al-servidor/).filter((el) => !el.closest("pre"))).toHaveLength(0);
  });

  it("check.status del verificador manda: 'no evaluado' es ámbar ('no verificable') aunque passed sea true; nunca verde", () => {
    expect(checkStatus({ passed: true, status: "no evaluado", reason: "ancla presente" })).toBe("no verificable");
    expect(checkStatus({ passed: true, status: "verificado" })).toBe("verificado");
    expect(checkStatus({ passed: true, status: "fallo detectado" })).toBe("fallo detectado");
    expect(checkStatus({ passed: false })).toBe("fallo detectado");
    // RPC caído o archivo que no es un paquete: passed=false pero "no evaluado" → no verificable, no fallo.
    expect(checkStatus({ passed: false, status: "no evaluado" })).toBe("no verificable");
  });

  it("total alterado: 'fallo detectado' con la causa visible", async () => {
    const r = await realResult("tampered_total.json");
    render(<AuditChecklist result={r} />);
    expect(screen.getByTestId("audit-verdict").textContent).toContain("fallo detectado");
    expect(screen.getAllByText(/publicado .*recomputado/).length).toBeGreaterThan(0);
  }, 30_000);
});

describe("MyVoteCheck · judgeInclusion", () => {
  it("encontrado en el paquete verificado ⇒ incluido", () => {
    expect(judgeInclusion({ found: { idx: 2 }, source: "paquete verificado", fromReceipt: true }).status).toBe("incluido");
  });
  it("comprobante local ausente del paquete ⇒ fallo detectado; tecleado a mano ⇒ no verificable", () => {
    expect(judgeInclusion({ found: null, source: "paquete verificado", fromReceipt: true }).status).toBe("fallo detectado");
    expect(judgeInclusion({ found: null, source: "ledger publicado", fromReceipt: false }).status).toBe("no verificable");
  });
});

const ANCHOR = { chainId: 84532, txHash: `0x${"ab".repeat(32)}` };
const HASH = `0x${"3c".repeat(32)}`;
/** Afirmaciones prohibidas (CLAUDE.md regla 1 y 2, D-13): el voto NO va a la cadena. */
const FORBIDDEN_CLAIMS = /voto (está|queda|quedó) en (la )?blockchain|boleta (está|queda|quedó) en (la )?blockchain|anónim|identidad verificada/i;

describe("MyVoteCheck · pasos y sello", () => {
  it("buildSteps: con sello el tercer paso compara con Base Sepolia (✓ sólo si el verificador lo dijo); sin sello, «se ancla al cerrar»", () => {
    expect(buildSteps({ anchor: null, anchorCheck: undefined }).map((s) => s.label)).toEqual(["Buscando tu código en el registro", "Comprobando el hash de tu boleta", "Sin sello todavía: se ancla al cerrar"]);
    expect(buildSteps({ anchor: ANCHOR, anchorCheck: "verificado" })[2]).toEqual({ label: "Comparando con el sello en Base Sepolia", mark: "ok" });
    expect(buildSteps({ anchor: ANCHOR, anchorCheck: undefined })[2].mark).toBe("skip");
    expect(buildSteps({ anchor: ANCHOR, anchorCheck: "fallo detectado" })[2].mark).toBe("fail");
  });

  it("anchorCheckOf: tri-estado del check anchor_matches, nunca verde por «no evaluado»", () => {
    const r = (c: { passed: boolean; status?: "verificado" | "fallo detectado" | "no evaluado"; reason?: string }) => ({ checks: [{ name: "anchor_matches", ...c }] });
    expect(anchorCheckOf(r({ passed: true, status: "verificado" }))).toBe("verificado");
    expect(anchorCheckOf(r({ passed: true, status: "no evaluado", reason: "no evaluado: sin RPC" }))).toBe("no verificable");
    expect(anchorCheckOf(r({ passed: true, reason: "no evaluado: sin RPC" }))).toBe("no verificable");
    expect(anchorCheckOf(r({ passed: false, status: "fallo detectado" }))).toBe("fallo detectado");
    expect(anchorCheckOf({ checks: [{ name: "tally_matches", passed: true }] })).toBeNull();
  });

  async function runCheck(ui: React.ReactElement, code: string) {
    render(ui);
    fireEvent.change(screen.getByLabelText("Código del comprobante"), { target: { value: code } });
    fireEvent.submit(screen.getByRole("button", { name: "Comprobar" }).closest("form")!);
  }

  it("paquete verificado con sello verificado: secuencia de 3 pasos (≥ 1,8 s), luego hash, posición, código y enlace a Basescan", async () => {
    vi.useFakeTimers();
    try {
      const verified = { ledger: [{ idx: 12, hash: HASH, nullifier: "777" }], finalHash: null, digest: "sha256:00", anchorCheck: "verificado" as const };
      await runCheck(<MyVoteCheck electionId="e1" verified={verified} anchor={ANCHOR} />, "777");
      const steps = screen.getByTestId("my-vote-steps");
      expect(steps.textContent).toContain("Buscando tu código en el registro…");
      expect(screen.queryByTestId("my-vote-result")).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS));
      expect(steps.querySelectorAll("[data-step-state=done]")).toHaveLength(1);
      expect(steps.textContent).toContain("Comprobando el hash de tu boleta…");
      expect(screen.queryByTestId("my-vote-result")).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS));
      expect(steps.textContent).toContain("Comparando con el sello en Base Sepolia…");
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS));
      expect(steps.querySelectorAll("[data-step-state=done]")).toHaveLength(3);
      const result = screen.getByTestId("my-vote-result");
      expect(result.dataset.status).toBe("incluido");
      // (a) Una sola frase arriba: estado + «Tu boleta está en … · posición #N».
      expect(screen.getByTestId("my-vote-summary").textContent).toBe("Tu boleta está en el paquete que verificaste · posición #12");
      // (b) Fila del sello: «Sellado en Base Sepolia», estado corto y «Ver en Basescan» con el hash abreviado.
      const anchor = screen.getByTestId("my-vote-anchor");
      expect(anchor.dataset.anchorCheck).toBe("verificado");
      expect(anchor.textContent).toContain("Sellado en Base Sepolia");
      expect(anchor.textContent).toContain("coincide · comprobado por tu teléfono");
      const link = screen.getByTestId("my-vote-anchor-link") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(`https://sepolia.basescan.org/tx/${ANCHOR.txHash}`);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noreferrer");
      expect(link.textContent).toContain("Ver en Basescan");
      expect(link.textContent).toContain("0xabab…abab");
      // (c) «Detalles técnicos» plegado por defecto; dentro, código, hash y posición con Copiar (siguen en el DOM).
      const details = screen.getByTestId("my-vote-details") as HTMLDetailsElement;
      expect(details.open).toBe(false);
      expect(screen.getByTestId("my-vote-hash").textContent).toBe(HASH);
      expect(screen.getByTestId("my-vote-index").textContent).toBe("#12");
      expect(screen.getByTestId("my-vote-code").textContent).toBe("777");
      details.open = true;
      expect(screen.getByRole("button", { name: "Copiar hash de tu boleta en el registro" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Copiar código del comprobante" })).toBeTruthy();
      expect(result.textContent).not.toMatch(FORBIDDEN_CLAIMS);
      expect(steps.textContent).not.toMatch(FORBIDDEN_CLAIMS);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sello publicado pero no evaluado por el navegador ⇒ «no evaluado por tu teléfono», nunca «coincide»", async () => {
    vi.useFakeTimers();
    try {
      const verified = { ledger: [{ idx: 0, hash: HASH, nullifier: "5" }], finalHash: null, digest: "sha256:00" };
      await runCheck(<MyVoteCheck electionId="e1" verified={verified} anchor={ANCHOR} />, "5");
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS * 3));
      const anchor = screen.getByTestId("my-vote-anchor");
      expect(anchor.dataset.anchorCheck).toBe("no verificable");
      expect(anchor.textContent).toContain("no evaluado por tu teléfono");
      expect(anchor.textContent).not.toContain("coincide");
      expect(screen.getByTestId("my-vote-steps").querySelector("[data-step-mark=skip]")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin sello: «El sello se publica al cerrar» y ningún enlace a Basescan; código ausente ⇒ no verificable sin hash", async () => {
    vi.useFakeTimers();
    try {
      const verified = { ledger: [{ idx: 3, hash: HASH, nullifier: "9" }], finalHash: null, digest: "sha256:00" };
      await runCheck(<MyVoteCheck electionId="e1" verified={verified} anchor={null} />, "9");
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS * 3));
      expect(screen.getByTestId("my-vote-anchor").textContent).toContain("se publica al cerrar la votación");
      expect(screen.queryByTestId("my-vote-anchor-link")).toBeNull();
      expect(screen.getByTestId("my-vote-steps").textContent).toContain("Sin sello todavía: se ancla al cerrar");
      cleanup();
      await runCheck(<MyVoteCheck electionId="e1" verified={verified} anchor={null} />, "4242");
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS * 3));
      expect(screen.getByTestId("my-vote-result").dataset.status).toBe("no verificable");
      expect(screen.getByTestId("my-vote-summary").textContent).toBe("No encontrado");
      expect(screen.getByTestId("my-vote-result").textContent).toContain("Revisa que lo hayas copiado completo");
      expect(screen.queryByTestId("my-vote-hash")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("durante la votación (ledger sin entradas): posición del servidor y hash «según el comprobante de este teléfono»", async () => {
    vi.useFakeTimers();
    const ledger = vi.spyOn(apiV1, "getLedger").mockResolvedValue({ electionId: "e2", status: "open", groupRoot: null, scope: null, genesisHash: null, finalHash: null, count: 7, proofsPublished: false, entries: [] });
    const inclusion = vi.spyOn(apiV1, "getInclusion").mockResolvedValue({ electionId: "e2", inclusionId: "31", receivedAt: "2026-10-24T15:00:00.000Z", includedAt: "2026-10-24T15:00:00.000Z", state: "incluido", nullifier: "31", index: 6 });
    try {
      localStorage.setItem("quorum.receipt.e2", JSON.stringify({ inclusionId: "31", nullifier: "31", index: 6, hash: HASH, state: "incluido", savedAt: "2026-10-24T15:00:00.000Z" }));
      render(<MyVoteCheck electionId="e2" verified={null} anchor={null} />);
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect((screen.getByLabelText("Código del comprobante") as HTMLInputElement).value).toBe("31");
      fireEvent.submit(screen.getByRole("button", { name: "Comprobar" }).closest("form")!);
      await act(() => vi.advanceTimersByTimeAsync(STEP_MS * 3));
      expect(ledger).toHaveBeenCalledWith("e2");
      expect(inclusion).toHaveBeenCalledWith("e2", "31");
      expect(screen.getByTestId("my-vote-summary").textContent).toBe("Tu boleta está en el registro del servidor · posición #6");
      expect(screen.getByTestId("my-vote-hash").textContent).toBe(HASH);
      // La nota «según el comprobante de este teléfono» va dentro de «Detalles técnicos» (plegado).
      expect((screen.getByTestId("my-vote-details") as HTMLDetailsElement).open).toBe(false);
      expect(screen.getByTestId("my-vote-details").textContent).toContain("según el comprobante de este teléfono");
    } finally {
      localStorage.removeItem("quorum.receipt.e2");
      ledger.mockRestore();
      inclusion.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("VoteReceiptCard (comprobante simple)", () => {
  it("votación abierta: ticket + «Esperando a que cierre la votación», sin enlaces para comprobar ni ver resultados", () => {
    render(<VoteReceiptCard electionId="e1" closed={false} endsAt="2026-10-24T22:00:00.000Z" receipt={{ inclusionId: "77", nullifier: "77", state: "incluido", at: "2026-10-24T19:45:00.000Z" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Tu voto fue contado" })).toBeTruthy();
    const wait = screen.getByTestId("waiting-pulse");
    expect(wait.getAttribute("data-mode")).toBe("closing");
    expect(wait.textContent).toContain("Esperando a que cierre la votación");
    expect(wait.textContent).toContain("Cierra a las");
    expect(screen.queryByRole("link", { name: "Comprobar mi voto" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver el resultado" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver resultados" })).toBeNull();
  });

  it("check grande, 'Tu voto fue contado', hora; cerrada: 'Ver el resultado' y 'Comprobar mi voto'; 'Código de tu comprobante'; sin jerga ni opción", () => {
    render(<VoteReceiptCard electionId="e1" closed receipt={{ inclusionId: "77", nullifier: "77", state: "incluido", at: "2026-10-24T19:45:00.000Z" }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tu voto fue contado");
    expect(screen.getByTestId("receipt-time").textContent).toMatch(/3:45/);
    expect(screen.getByText("Código de tu comprobante")).toBeTruthy();
    expect(screen.getByTestId("receipt-inclusion-id").textContent).toBe("77");
    expect(screen.getByTestId("receipt-inclusion-id").closest("details")).toBeNull();
    expect(screen.queryByTestId("link-mode")).toBeNull();
    expect(screen.queryByTestId("tech-details")).toBeNull();
    expect(screen.getByRole("link", { name: "Comprobar mi voto" }).getAttribute("href")).toBe("/e/e1?comprobar=1#mi-voto");
    expect(screen.queryByRole("link", { name: "Ver resultados" })).toBeNull(); // sin «en vivo» para el votante
    expect(screen.getByRole("link", { name: "Ver el resultado" }).getAttribute("href")).toBe("/e/e1");
    const text = screen.getByTestId("receipt").textContent ?? "";
    expect(text).not.toMatch(/opción elegida|Reparar/);
    expect(text).not.toMatch(/wallet|Kernel|eoa-demo|EIP-?712|FaceBinding|Semaphore|nullifier|commitment|on-?chain|Base Sepolia|ZeroDev|demo/i);
  });
  it("recibido (sin inclusión confirmada) no dice 'contado'", () => {
    render(<VoteReceiptCard electionId="e1" receipt={{ inclusionId: "7", nullifier: "7", state: "recibido" }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tu voto fue recibido");
  });
});

describe("CandidatesEditor", () => {
  it("genera ids estables y únicos", () => {
    expect(candidateId("Huerto comunitario", new Set())).toBe("p-huerto-comunitario");
    expect(candidateId("Huerto comunitario", new Set(["p-huerto-comunitario"]))).toBe("p-huerto-comunitario-2");
  });

  it("agrega un proyecto con monto y valida el nombre", () => {
    const onChange = vi.fn();
    render(<CandidatesEditor candidates={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /agregar proyecto/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/al menos 3/);
    fireEvent.change(screen.getByLabelText("Proyecto"), { target: { value: "Iluminación del estacionamiento" } });
    fireEvent.change(screen.getByLabelText("Monto (opcional)"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar proyecto/i }));
    expect(onChange).toHaveBeenCalledWith([{ id: "p-iluminacion-del-estacion", label: "Iluminación del estacionamiento", amount: 1200 }]);
  });
});

/** PNG de 1×1 (fixture): cumple el formato `OptionImage` del contrato. */
const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("BallotScreen · tarjetas con foto y subtítulo", () => {
  const base = { electionId: "e1", electionTitle: "Premio del público (fixture)", voterId: "v1", inviteToken: "tok", onDone: () => undefined, onAlreadyVoted: () => undefined };

  it("con `image` muestra la foto (alt vacío, decorativa) y el `subtitle` gris; sin foto, la inicial; el nombre sigue siendo el nombre accesible", () => {
    render(<BallotScreen {...base} options={[{ id: "a", label: "Equipo Ají", subtitle: "Pista de salud", image: PNG_1x1 }, { id: "b", label: "Equipo Bambú" }]} />);
    const withPhoto = screen.getByRole("radio", { name: /^Equipo Ají/ });
    const img = withPhoto.querySelector("img")!;
    expect(img).toBeTruthy();
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("src")).toBe(PNG_1x1);
    expect(screen.getByTestId("option-subtitle").textContent).toBe("Pista de salud");
    const noPhoto = screen.getByRole("radio", { name: "Equipo Bambú" });
    expect(noPhoto.querySelector("img")).toBeNull();
    expect(noPhoto.querySelector('[data-testid="option-avatar"]')!.textContent).toBe("E");
    // El avatar es decorativo: no entra en el nombre accesible.
    expect(noPhoto.querySelector('[data-testid="option-avatar"]')!.getAttribute("aria-hidden")).toBe("true");
    for (const r of screen.getAllByRole("radio")) expect(r.className).toMatch(/min-h-14/);
    // Nada de resultados en la boleta.
    expect(screen.getByTestId("ballot").textContent).not.toMatch(/%|votos|resultado/i);
    fireEvent.click(withPhoto);
    expect(screen.getByTestId("vote-button").textContent).toBe("Votar: Equipo Ají");
  });

  it("Sí/No sin foto ni subtítulo: iniciales distintas y sin subtítulo", () => {
    render(<BallotScreen {...base} options={[{ id: "si", label: "Sí" }, { id: "no", label: "No" }]} />);
    expect(screen.getAllByTestId("option-avatar").map((a) => a.textContent)).toEqual(["S", "N"]);
    expect(screen.queryByTestId("option-subtitle")).toBeNull();
    expect(screen.getByRole("radio", { name: "Sí" })).toBeTruthy();
  });
});

describe("VerifyNowPanel · arranca sola y resume en una tarjeta compacta", () => {
  const fixtureSource = { kind: "fixture" as const, url: "/fixtures/protocol/valid.json", label: "fixture · simulación" };
  function stubFetch(file: string) {
    const bytes = fixture(file);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200, headers: { "content-type": "application/json" } })));
  }
  afterEach(() => vi.unstubAllGlobals());

  it("buildVerifySteps: tres pasos; el tercero compara con el sello solo si hay ancla y ✓ solo si el verificador lo dijo", () => {
    expect(buildVerifySteps(null).map((s) => s.label)).toEqual(["Descargando el paquete", "Recalculando el recuento en tu teléfono", "Sin sello publicado: nada que comparar en Base Sepolia"]);
    expect(buildVerifySteps(ANCHOR, "verificado")[2]).toEqual({ label: "Comparando con el sello en Base Sepolia", mark: "ok" });
    expect(buildVerifySteps(ANCHOR, "no verificable")[2].mark).toBe("skip");
    expect(buildVerifySteps(ANCHOR, "fallo detectado")[2].mark).toBe("fail");
  });

  it("autoStart: pasos visibles sin tocar nada; al terminar, veredicto REAL del verificador (parcial: ancla no evaluada), huella y enlace al sello", async () => {
    stubFetch("valid.json");
    const onRun = vi.fn();
    const onVerified = vi.fn();
    render(<VerifyNowPanel source={fixtureSource} autoStart anchor={ANCHOR} onRun={onRun} onVerified={onVerified} />);
    expect(screen.getByTestId("verify-steps").textContent).toContain("Descargando el paquete…");
    expect(screen.queryByTestId("verify-summary")).toBeNull();
    const summary = await screen.findByTestId("verify-summary", {}, { timeout: 20_000 });
    expect(summary.dataset.status).toBe("verificado");
    const verdict = screen.getByTestId("audit-verdict");
    expect(verdict.textContent).toContain("verificado");
    expect(verdict.textContent).toContain("no verificable");
    expect(summary.textContent).toContain("Verificación parcial: Ancla on-chain sin evaluar");
    expect(screen.getByTestId("verify-digest").getAttribute("title")).toMatch(/^sha256:[0-9a-f]{64}$/);
    const link = screen.getByTestId("verify-anchor-link");
    expect(link.getAttribute("href")).toBe(`https://sepolia.basescan.org/tx/${ANCHOR.txHash}`);
    expect(screen.getByTestId("verify-anchor").textContent).toContain("no evaluado por tu teléfono");
    expect(screen.getByTestId("verify-anchor").textContent).not.toContain("coincide");
    expect(screen.getByTestId("verify-steps").querySelectorAll("[data-step-state=done]")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Verificar de nuevo/ })).toBeTruthy();
    expect(onRun).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }));
    expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({ anchorCheck: "no verificable", ledger: expect.any(Array) }));
    expect(summary.textContent).not.toMatch(FORBIDDEN_CLAIMS);
  });

  it("sin ancla: «Sin sello» y ningún enlace; paquete alterado ⇒ fallo detectado con la comprobación que falló", async () => {
    stubFetch("valid.json");
    render(<VerifyNowPanel source={fixtureSource} autoStart anchor={null} />);
    await screen.findByTestId("verify-summary", {}, { timeout: 20_000 });
    expect(screen.getByTestId("verify-anchor").textContent).toContain("Sin sello");
    expect(screen.queryByTestId("verify-anchor-link")).toBeNull();
    cleanup();
    stubFetch("tampered_total.json");
    render(<VerifyNowPanel source={fixtureSource} autoStart anchor={null} />);
    const summary = await screen.findByTestId("verify-summary", {}, { timeout: 20_000 });
    expect(summary.dataset.status).toBe("fallo detectado");
    expect(screen.getByTestId("verify-failures").textContent).toContain("Recuento reproducido");
  });

  it("sin autoStart no arranca: botón «Verificar ahora» y ningún paso", () => {
    stubFetch("valid.json");
    render(<VerifyNowPanel source={fixtureSource} anchor={null} />);
    expect(screen.getByRole("button", { name: /Verificar ahora/ })).toBeTruthy();
    expect(screen.queryByTestId("verify-steps")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("WaitingPulse", () => {
  it("modo continuo: 'Faltan N personas para habilitar el voto (ahora X de K)' (singular con 1)", () => {
    render(<WaitingPulse mode="continuous" k={5} size={3} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(WAITING_TITLE);
    expect(screen.getByTestId("waiting-pulse").dataset.mode).toBe("continuous");
    expect(screen.getByTestId("waiting-pulse-detail").textContent).toBe("Faltan 2 personas para habilitar el voto (ahora 3 de 5)");
    expect(waitingContinuousText(5, 4)).toBe("Falta 1 persona para habilitar el voto (ahora 4 de 5)");
    expect(screen.getByTestId("waiting-pulse").querySelectorAll(".q-wave")).toHaveLength(3);
    cleanup();
    render(<WaitingPulse mode="continuous" k={5} size={null} />);
    expect(screen.getByTestId("waiting-pulse-detail").textContent).toContain("Comprobando cuántas personas hay inscritas…");
  });

  it("modo con fases: 'Empieza a las HH:MM' con hora, o 'El organizador la abrirá' sin hora; los hijos van debajo", () => {
    render(
      <WaitingPulse mode="phased" startsAt="2026-10-24T19:45:00.000Z">
        <p data-testid="child">cuenta regresiva</p>
      </WaitingPulse>,
    );
    expect(screen.getByTestId("waiting-pulse-detail").textContent).toMatch(/^Empieza a las 3:45/);
    expect(screen.getByTestId("waiting-pulse").contains(screen.getByTestId("child"))).toBe(true);
    cleanup();
    render(<WaitingPulse mode="phased" startsAt={null} />);
    expect(screen.getByTestId("waiting-pulse-detail").textContent).toBe("El organizador la abrirá");
    const text = screen.getByTestId("waiting-pulse").textContent ?? "";
    expect(text).not.toMatch(/anónim|secreto|identidad verificada/i);
  });
});
