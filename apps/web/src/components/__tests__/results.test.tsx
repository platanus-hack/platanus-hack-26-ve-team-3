// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsCard } from "@/components/results/ResultsCard";
import { hasTies, RankedCards, rankOptions, TIE_ROTATE_MS } from "@/components/results/RankedCards";
import { WinnerScreen, winnerOutcome } from "@/components/results/WinnerScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const base = { totalVotes: 7, eligible: 9, turnout: 7 / 9, live: true };

describe("ResultsCard", () => {
  it("ordena por votos y destaca la que va ganando", () => {
    render(<ResultsCard {...base} options={[{ id: "a", label: "Uno", count: 1 }, { id: "b", label: "Dos", count: 4 }, { id: "c", label: "Tres", count: 2 }]} />);
    expect(screen.getByText("Va ganando")).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1).map((r) => r.querySelector("th")?.textContent);
    expect(rows).toEqual(["Dos", "Tres", "Uno"]);
  });

  it("con empate en el primer lugar no declara ganadora", () => {
    render(<ResultsCard {...base} options={[{ id: "a", label: "Uno", count: 3 }, { id: "b", label: "Dos", count: 3 }]} totalVotes={6} />);
    expect(screen.queryByText("Va ganando")).toBeNull();
  });

  it("con menos de 5 votos oculta el desglose y dice cuántos faltan", () => {
    render(<ResultsCard {...base} totalVotes={1} turnout={1 / 3} eligible={3} options={[{ id: "a", label: "Uno", count: null }, { id: "b", label: "Dos", count: null }]} />);
    expect(screen.getByText("Faltan 4 votos para ver el desglose")).toBeTruthy();
    expect(screen.queryByText("Uno")).toBeNull();
    expect(screen.queryByText("Va ganando")).toBeNull();
  });

  it("cerrada: muestra el estado y 'Más votada' en vez de 'En vivo'", () => {
    render(<ResultsCard {...base} live={false} statusLabel="Cerrada" options={[{ id: "a", label: "Uno", count: 5 }, { id: "b", label: "Dos", count: 2 }]} />);
    expect(screen.getByText("Cerrada")).toBeTruthy();
    expect(screen.getByText("Más votada")).toBeTruthy();
    expect(screen.queryByText("En vivo")).toBeNull();
  });
});

/* ---------- RankedCards ---------- */

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const seven = [
  { id: "opt-1", label: "1", count: 1 },
  { id: "opt-2", label: "2", subtitle: "Cancha", image: PNG, count: 3 },
  { id: "opt-3", label: "3", subtitle: "Huerto", count: 2 },
  { id: "opt-4", label: "4", count: 1 },
  { id: "opt-5", label: "5", count: 0 },
];
const cardIds = () => screen.getAllByTestId("ranked-card").map((li) => li.getAttribute("data-option-id"));

describe("RankedCards", () => {
  it("rankOptions: de mayor a menor, estable, y rota solo los grupos empatados", () => {
    expect(rankOptions(seven).map((o) => o.id)).toEqual(["opt-2", "opt-3", "opt-1", "opt-4", "opt-5"]);
    expect(rankOptions(seven, 1).map((o) => o.id)).toEqual(["opt-2", "opt-3", "opt-4", "opt-1", "opt-5"]);
    expect(rankOptions(seven, 2).map((o) => o.id)).toEqual(["opt-2", "opt-3", "opt-1", "opt-4", "opt-5"]);
    expect(hasTies(seven)).toBe(true);
    expect(hasTies([{ count: 3 }, { count: 2 }, { count: 0 }])).toBe(false);
  });

  it("orden por votos, porcentajes en aqua, foto o inicial, subtítulo y líder marcada", () => {
    render(<RankedCards options={seven} totalVotes={7} />);
    expect(cardIds()).toEqual(["opt-2", "opt-3", "opt-1", "opt-4", "opt-5"]);
    const cards = screen.getAllByTestId("ranked-card");
    expect(cards[0]!.getAttribute("data-lead")).toBe("true");
    expect(cards[1]!.getAttribute("data-lead")).toBeNull();
    expect(cards[0]!.textContent).toMatch(/43\s?%/);
    expect(cards[1]!.textContent).toMatch(/29\s?%/);
    expect(cards[4]!.textContent).toMatch(/0\s?%/);
    expect(cards[0]!.querySelector("img")?.getAttribute("src")).toBe(PNG);
    expect(cards[0]!.textContent).toContain("Cancha");
    expect(cards[1]!.querySelector("img")).toBeNull();
    expect(cards[1]!.textContent).toContain("Huerto");
    expect(screen.getByTestId("ranked-cards").textContent).not.toMatch(/verificad/i);
  });

  it("con dos actualizaciones del tally las tarjetas quedan en el nuevo orden (misma key por opción)", () => {
    const { rerender } = render(<RankedCards options={[{ id: "a", label: "A", count: 4 }, { id: "b", label: "B", count: 2 }, { id: "c", label: "C", count: 1 }]} totalVotes={7} />);
    expect(cardIds()).toEqual(["a", "b", "c"]);
    rerender(<RankedCards options={[{ id: "a", label: "A", count: 4 }, { id: "b", label: "B", count: 2 }, { id: "c", label: "C", count: 5 }]} totalVotes={11} />);
    expect(cardIds()).toEqual(["c", "a", "b"]);
  });

  it("empate: las empatadas se turnan el puesto cada ~4 s; sin empate nada se mueve", () => {
    vi.useFakeTimers();
    render(<RankedCards options={seven} totalVotes={7} />);
    expect(cardIds()).toEqual(["opt-2", "opt-3", "opt-1", "opt-4", "opt-5"]);
    act(() => {
      vi.advanceTimersByTime(TIE_ROTATE_MS);
    });
    expect(cardIds()).toEqual(["opt-2", "opt-3", "opt-4", "opt-1", "opt-5"]);
    act(() => {
      vi.advanceTimersByTime(TIE_ROTATE_MS);
    });
    expect(cardIds()).toEqual(["opt-2", "opt-3", "opt-1", "opt-4", "opt-5"]);
    cleanup();

    render(<RankedCards options={[{ id: "a", label: "A", count: 4 }, { id: "b", label: "B", count: 2 }, { id: "c", label: "C", count: 1 }]} totalVotes={7} />);
    act(() => {
      vi.advanceTimersByTime(TIE_ROTATE_MS * 3);
    });
    expect(cardIds()).toEqual(["a", "b", "c"]);
  });
});

/* ---------- WinnerScreen ---------- */

const audit = {
  electionId: "e2e-samanes",
  verifierVersion: "fixture-0.0.0",
  protocol: "semaphore-ledger" as const,
  inputArtifactDigest: `sha256:${"7e".repeat(32)}`,
  checkedAt: "2026-10-24T22:01:00.000Z",
  valid: true,
  checks: [],
  unsupportedGuarantees: [],
};

describe("WinnerScreen", () => {
  it("ganador: foto grande, porcentaje, nombre, las demás en orden; «verificado» solo con la respuesta del verificador", () => {
    const { rerender } = render(<WinnerScreen electionId="e2e-samanes" status="auditable" options={seven} totalVotes={7} audit={audit} />);
    const box = screen.getByTestId("winner-screen");
    expect(box.getAttribute("data-outcome")).toBe("winner");
    expect(screen.getByTestId("winner-name").textContent).toBe("2");
    expect(screen.getByTestId("winner-share").textContent).toMatch(/43\s?%/);
    expect(box.textContent).toContain("Cancha");
    expect(screen.getByTestId("winner-verdict").textContent?.trim()).toBe("Resultado verificado");
    expect(box.textContent).toContain("fixture-0.0.0");
    expect(cardIds()).toEqual(["opt-3", "opt-1", "opt-4", "opt-5"]);
    expect(screen.getByRole("link", { name: /Comprobar el resultado/ }).getAttribute("href")).toBe("/e/e2e-samanes");

    rerender(<WinnerScreen electionId="e2e-samanes" status="auditable" options={seven} totalVotes={7} audit={null} />);
    expect(screen.getByTestId("winner-verdict").textContent).not.toMatch(/verificado/i);
    expect(screen.getByTestId("winner-verdict").textContent).toContain("Resultado publicado");
  });

  it("empate en el primer lugar: «Empate», fotos lado a lado, sin ganador", () => {
    const tie = [
      { id: "a", label: "Ana", image: PNG, count: 3 },
      { id: "b", label: "Beto", count: 3 },
      { id: "c", label: "Cris", count: 1 },
    ];
    render(<WinnerScreen electionId="x" status="drawn" options={tie} totalVotes={7} audit={audit} />);
    expect(screen.getByTestId("winner-screen").getAttribute("data-outcome")).toBe("tie");
    expect(screen.getByTestId("winner-name").textContent).toBe("Empate");
    const tied = screen.getByRole("list", { name: "Opciones empatadas en el primer lugar" });
    expect(tied.querySelectorAll("li").length).toBe(2);
    expect(tied.querySelectorAll("img").length).toBe(1);
    expect(tied.textContent).toContain("Ana");
    expect(tied.textContent).toContain("Beto");
    expect(cardIds()).toEqual(["c"]);
    expect(winnerOutcome("auditable", tie, 7).kind).toBe("tie");
  });

  it("fallo detectado: sin ganador, enlace a Transparencia, nunca «verificado»", () => {
    render(<WinnerScreen electionId="e2e-samanes" status="failed" options={seven} totalVotes={7} audit={{ ...audit, valid: false }} />);
    const box = screen.getByTestId("winner-screen");
    expect(box.getAttribute("data-outcome")).toBe("failed");
    expect(box.textContent).toContain("Fallo detectado");
    expect(box.textContent).toContain("El verificador rechazó el paquete");
    expect(box.textContent).not.toMatch(/\bverificado\b/i);
    expect(screen.queryByTestId("winner-name")).toBeNull();
    expect(screen.queryAllByTestId("ranked-card").length).toBe(0);
    expect(screen.getByRole("link", { name: /Ver en Transparencia/ }).getAttribute("href")).toBe("/e/e2e-samanes");
  });

  it("menos de 5 votos al cierre: sin desglose ni ganador", () => {
    render(<WinnerScreen electionId="x" status="auditable" options={seven.map((o) => ({ ...o, count: null }))} totalVotes={3} audit={audit} />);
    const box = screen.getByTestId("winner-screen");
    expect(box.getAttribute("data-outcome")).toBe("hidden");
    expect(box.textContent).toContain("Se publicó sin desglose");
    expect(box.textContent).toContain("Menos de 5 votos");
    expect(screen.queryByTestId("winner-name")).toBeNull();
    expect(screen.queryAllByTestId("ranked-card").length).toBe(0);
    expect(winnerOutcome("auditable", seven, 4).kind).toBe("hidden");
  });
});
