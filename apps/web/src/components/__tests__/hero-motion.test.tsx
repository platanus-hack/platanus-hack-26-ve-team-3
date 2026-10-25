// @vitest-environment jsdom
/**
 * Hero animado de la landing: con movimiento reducido, composición fija y el resumen de los 6 actos legible; con
 * movimiento, el texto completo sigue en el DOM, hay pausa (WCAG 2.2.2) y `window.__seek`. Guion: tiempos coherentes,
 * titulares cortos y lenguaje honesto (D-15).
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroMotion } from "@/components/landing/HeroMotion";
import { ACTS, HOLDS, IMPOSTOR, LOOP, SEAMS, actAt, since, toScene } from "@/components/landing/hero/timeline";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  window.matchMedia = globalThis.matchMedia;
}

class Observer {
  observe() {}
  disconnect() {}
}

function stubObservers() {
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", Observer);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const plain = (s: string) => s.replaceAll("*", "");

describe("HeroMotion", () => {
  it("movimiento reducido: composición fija, sin loop ni controles, y los 6 actos legibles", () => {
    mockMatchMedia(true);
    stubObservers();
    render(<HeroMotion />);
    const hero = screen.getByRole("region", { name: "Nadie tiene que creerle a quien cuenta." });
    expect(hero.dataset.mode).toBe("still");
    expect(within(hero).queryByRole("button", { name: /Pausar/ })).toBeNull();
    const steps = within(hero).getAllByRole("heading", { level: 3 });
    expect(steps).toHaveLength(ACTS.length);
    ACTS.forEach((a, i) => {
      expect(steps[i].textContent).toContain(plain(a.title));
      const summary = within(hero).getByText(a.summary);
      expect(summary.closest(".sr-only")).toBeNull();
    });
    expect(within(hero).queryByRole("link", { name: /Crear votación/ })).toBeNull(); // D-25: sin «Crear votación» en la landing
    expect(within(hero).getByRole("link", { name: "Mis votaciones" }).getAttribute("href")).toBe("/votaciones");
  });

  it("con movimiento: texto completo en el DOM, pausa accesible, saltos por acto y __seek", () => {
    mockMatchMedia(false);
    stubObservers();
    render(<HeroMotion />);
    const hero = screen.getByRole("region", { name: "Nadie tiene que creerle a quien cuenta." });
    expect(hero.dataset.mode).toBe("loop");
    expect(within(hero).getByRole("heading", { level: 1 })).toBeTruthy();
    expect(within(hero).getAllByRole("heading", { level: 3 })).toHaveLength(ACTS.length);
    for (const a of ACTS) expect(within(hero).getByText(a.summary)).toBeTruthy();

    const pause = within(hero).getByRole("button", { name: "Pausar animación" });
    fireEvent.click(pause);
    expect(within(hero).getByRole("button", { name: "Reanudar animación" })).toBeTruthy();

    const jumps = within(within(hero).getByRole("group", { name: /Ir a una parte/ })).getAllByRole("button");
    expect(jumps).toHaveLength(ACTS.length);
    expect(jumps[0].getAttribute("aria-current")).toBe("true");
    fireEvent.click(jumps[2]);
    expect(jumps[2].getAttribute("aria-current")).toBe("true");

    expect(typeof window.__seek).toBe("function");
    expect(window.__heroLoop).toBe(LOOP);
    act(() => window.__seek?.(ACTS[4].start + 1));
    expect(jumps[4].getAttribute("aria-current")).toBe("true");
  });
});

describe("guion (estado = f(t))", () => {
  it("los actos van en orden, los cuadros de referencia caen en su acto y el loop dura 24–28 s", () => {
    expect(LOOP).toBeGreaterThanOrEqual(24);
    expect(LOOP).toBeLessThanOrEqual(28);
    for (let i = 1; i < ACTS.length; i++) expect(ACTS[i].start).toBeGreaterThan(ACTS[i - 1].start);
    HOLDS.forEach((h, i) => expect(actAt(h)).toBe(i));
    expect(actAt(0)).toBe(0);
    expect(actAt(LOOP - 0.5)).toBe(0); // la tarjeta recompuesta ya es el acto A
    expect(SEAMS).toHaveLength(ACTS.length);
  });

  it("el impostor se intercala sin salto: el tiempo de escena es continuo y se queda quieto durante el acto", () => {
    expect(toScene(IMPOSTOR.from - 0.001)).toBeCloseTo(IMPOSTOR.from, 2);
    expect(toScene(10)).toBe(IMPOSTOR.from);
    expect(toScene(IMPOSTOR.to + 0.001)).toBeCloseTo(IMPOSTOR.from, 2);
    expect(toScene(LOOP)).toBe(LOOP - (IMPOSTOR.to - IMPOSTOR.from));
  });

  it("titulares de 3 a 7 palabras y sin huecos: el siguiente entra antes de que el anterior termine de salir", () => {
    ACTS.forEach((a, i) => {
      const n = plain(a.title).split(" ").length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      const next = ACTS[(i + 1) % ACTS.length];
      expect(since(a.titleOut, next.titleIn)).toBeLessThan(0.5);
    });
  });

  it("lenguaje honesto: ninguna palabra prohibida (D-15)", () => {
    const text = ACTS.map((a) => `${a.title} ${a.summary}`).join(" ").toLowerCase();
    for (const w of ["anónim", "secret", "100 %", "100%", "imposible", "inhackeable"]) expect(text).not.toContain(w);
  });
});
