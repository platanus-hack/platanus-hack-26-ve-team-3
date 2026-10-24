// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditResult } from "@quorum/contracts";
import { AuditChecklist, checkStatus, overallStatus } from "@/components/AuditChecklist";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import { judgeInclusion } from "@/components/election/MyVoteCheck";
import { CandidatesEditor, candidateId } from "@/components/org/CandidatesEditor";
import { VoteReceiptCard } from "@/components/voter/VoteReceiptCard";
import { WalletStep } from "@/components/voter/wallet";
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

describe("VoteReceiptCard", () => {
  it("muestra el nullifier y nunca la opción", () => {
    render(<VoteReceiptCard electionId="e1" electionTitle="Votación ficticia" receipt={{ inclusionId: "77", nullifier: "77", index: 0, state: "incluido" }} />);
    expect(screen.getByTestId("receipt-inclusion-id").textContent).toBe("77");
    expect(screen.getByTestId("receipt").textContent).not.toMatch(/opción elegida|Reparar/);
  });
});

describe("WalletStep real (@quorum/wallet) sin NEXT_PUBLIC_ZERODEV_PROJECT_ID", () => {
  it("está etiquetado como demo, guarda la clave en localStorage y entrega {address, signature, mode:'eoa-demo'} por onDone", async () => {
    localStorage.clear();
    const onDone = vi.fn();
    render(<WalletStep electionId="e1" voterId="v1" faceBindingHash={`0x${"ab".repeat(32)}`} onDone={onDone} />);
    expect(screen.getByTestId("wallet-kind").textContent).toMatch(/demo/i);
    fireEvent.click(screen.getByRole("button", { name: /crear wallet y firmar/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const r = onDone.mock.calls[0][0];
    expect(r.mode).toBe("eoa-demo");
    expect(r.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(r.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(localStorage.getItem("quorum.wallet.eoaDemo.v1")).toMatch(/^0x[0-9a-f]{64}$/);
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
