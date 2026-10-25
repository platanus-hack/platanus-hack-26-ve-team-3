// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditResult } from "@quorum/contracts";
import { AuditChecklist, checkStatus, overallStatus } from "@/components/AuditChecklist";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import { judgeInclusion } from "@/components/election/MyVoteCheck";
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

describe("VoteReceiptCard (comprobante simple)", () => {
  it("check grande, 'Tu voto fue contado', hora, 'Comprobar mi voto', 'Ver resultados' y 'Código de tu comprobante'; sin jerga ni opción", () => {
    render(<VoteReceiptCard electionId="e1" receipt={{ inclusionId: "77", nullifier: "77", state: "incluido", at: "2026-10-24T19:45:00.000Z" }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tu voto fue contado");
    expect(screen.getByTestId("receipt-time").textContent).toMatch(/3:45/);
    expect(screen.getByText("Código de tu comprobante")).toBeTruthy();
    expect(screen.getByTestId("receipt-inclusion-id").textContent).toBe("77");
    expect(screen.getByTestId("receipt-inclusion-id").closest("details")).toBeNull();
    expect(screen.queryByTestId("link-mode")).toBeNull();
    expect(screen.queryByTestId("tech-details")).toBeNull();
    expect(screen.getByRole("link", { name: "Comprobar mi voto" }).getAttribute("href")).toBe("/e/e1?comprobar=1#mi-voto");
    expect(screen.getByRole("link", { name: "Ver resultados" }).getAttribute("href")).toBe("/e/e1/live");
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
