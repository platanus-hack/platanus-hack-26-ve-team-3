// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsCard } from "@/components/results/ResultsCard";

afterEach(cleanup);

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
