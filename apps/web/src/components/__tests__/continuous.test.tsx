// @vitest-environment jsdom
/**
 * D-23 modo continuo en la UI: a qué pantalla va el votante, el aviso de K que se convierte solo en boleta y las
 * estadísticas del tamaño del grupo del centro de transparencia.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InviteResponse } from "@quorum/contracts";
import { AnonymityGate, anonymityGateText } from "@/components/voter/AnonymityGate";
import { autoView } from "@/components/voter/VoterFlow";
import { groupSizeStats, groupSizesOf } from "@/components/election/AnonymityCard";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const FORBIDDEN = /\bwallet|smart wallet|\bfirma|EIP-?712|FaceBinding|Semaphore|credencial|nullifier|commitment|Kernel|eoa-demo|on-?chain|blockchain|Base Sepolia|ZeroDev|testnet/i;

function inv(status: "open" | "registration", voter: Partial<InviteResponse["voter"]> = {}): InviteResponse {
  return {
    election: { id: "e1", title: "Evento ficticio", kind: "yes-no", options: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }], status, endsAt: "2026-10-25T22:00:00.000Z", votingStartsAt: null, votingMode: "continuous", minAnonymitySet: 5 },
    voter: { id: "v1", displayName: "Ana", walletAddress: null, livenessPassedAt: null, votedAt: null, ...voter },
  };
}
const none = { identity: null, registered: false, receipt: null, pendingFace: null };
const linked = { identity: { voterId: "v1", faceBindingHash: `0x${"1".repeat(64)}` } as never, registered: true, receipt: null, pendingFace: null };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("autoView en modo continuo (votación abierta y la inscripción también)", () => {
  it("quien llega con la votación abierta se inscribe (no ve 'no quedó inscrito')", () => {
    expect(autoView(inv("open"), none, false)).toBe("intro");
    expect(autoView(inv("open"), none, true)).toBe("face");
  });
  it("inscrito → boleta de inmediato (sin espera)", () => {
    expect(autoView(inv("open", { walletAddress: "0xabc", livenessPassedAt: "x" }), linked, true)).toBe("ballot");
  });
  it("revisión manual pendiente sigue funcionando durante la votación", () => {
    expect(autoView(inv("open", { review: "pending" }), none, true)).toBe("review");
  });
  it("con fases, votación abierta sin inscripción → not-linked (como siempre)", () => {
    const phased = inv("open");
    phased.election.votingMode = "phased";
    expect(autoView(phased, none, false)).toBe("not-linked");
  });
});

describe("AnonymityGate", () => {
  it("con menos de K inscritos muestra el aviso y la boleta aparece sola al alcanzar K", async () => {
    let size = 3;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ electionId: "e1", status: "open", frozen: false, groupRoot: "1", scope: "2", merkleTreeDepth: 10, commitments: [], votingMode: "continuous", size, minAnonymitySet: 5, rootWindow: 32 }), { status: 200 })));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(
      <AnonymityGate electionId="e1" minAnonymitySet={5}>
        <p>BOLETA</p>
      </AnonymityGate>,
    );
    expect((await screen.findByTestId("anonymity-gate-text")).textContent).toBe("Tu voto se habilita cuando haya 5 personas inscritas (ahora 3)");
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(screen.queryByText("BOLETA")).toBeNull();
    size = 5;
    await vi.advanceTimersByTimeAsync(3100);
    expect(await screen.findByText("BOLETA")).toBeTruthy();
    vi.useRealTimers();
  });
  it("sin K (modo con fases) muestra la boleta directamente", () => {
    render(
      <AnonymityGate electionId="e1" minAnonymitySet={null}>
        <p>BOLETA</p>
      </AnonymityGate>,
    );
    expect(screen.getByText("BOLETA")).toBeTruthy();
  });
  it("texto exacto del aviso", () => {
    expect(anonymityGateText(5, 3)).toBe("Tu voto se habilita cuando haya 5 personas inscritas (ahora 3)");
  });
});

describe("tamaño del grupo por boleta (centro de transparencia)", () => {
  it("mínimo y mediana como el verificador; ignora inscripciones", () => {
    const pkg = { ledger: [{ kind: "member_added" }, { kind: "ballot", groupSize: 5 }, { kind: "ballot", groupSize: 9 }, { kind: "ballot", groupSize: 6 }, { kind: "ballot", groupSize: 27 }] };
    expect(groupSizesOf(pkg)).toEqual([5, 9, 6, 27]);
    expect(groupSizeStats(groupSizesOf(pkg))).toEqual({ min: 5, median: 7, count: 4 });
    expect(groupSizeStats([])).toBeNull();
    expect(groupSizesOf({ ledger: [{ idx: 0, proof: {} }] })).toEqual([]);
  });
});
