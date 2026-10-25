// @vitest-environment jsdom
/**
 * «Cómo funciona por detrás» (landing): con movimiento reducido se ven los 6 pasos quietos; con movimiento,
 * el texto de los 6 pasos sigue en el DOM con encabezados. Motor puro: extremos publicables y lenguaje honesto (D-15).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOW_STEPS, HowItWorksMotion } from "@/components/landing/HowItWorksMotion";
import { activeBeat, beatHold, stepOpacity } from "@/components/landing/how-it-works/motion";

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

class IO {
  observe() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HowItWorksMotion", () => {
  it("movimiento reducido: cuadro quieto con los 6 pasos legibles", () => {
    mockMatchMedia(true);
    render(<HowItWorksMotion />);
    const section = screen.getByRole("region", { name: /Confía en la prueba/ });
    expect(section.dataset.mode).toBe("still");
    const headings = within(section).getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(6);
    HOW_STEPS.forEach((s, i) => {
      expect(headings[i].textContent).toContain(s.title);
      expect(within(section).getByText(s.body)).toBeTruthy();
    });
  });

  it("con movimiento: el texto de los 6 pasos está en el DOM con encabezados", () => {
    mockMatchMedia(false);
    vi.stubGlobal("IntersectionObserver", IO);
    render(<HowItWorksMotion />);
    const section = screen.getByRole("region", { name: /Confía en la prueba/ });
    expect(section.dataset.mode).toBe("scroll");
    expect(within(section).getByRole("heading", { level: 2 })).toBeTruthy();
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(6);
    for (const s of HOW_STEPS) expect(within(section).getByText(s.body)).toBeTruthy();
    expect(typeof window.__seek).toBe("function");
  });
});

describe("motor (estado = f(p))", () => {
  it("p=0 muestra solo el paso 1 y p=1 solo el 6", () => {
    expect(stepOpacity(0, 0)).toBe(1);
    expect(stepOpacity(0, 1)).toBe(0);
    expect(stepOpacity(1, 5)).toBe(1);
    expect(stepOpacity(1, 4)).toBe(0);
    expect(activeBeat(0)).toBe(0);
    expect(activeBeat(1)).toBe(5);
  });

  it("a mitad de cada beat su texto está entero y el resto no; el cuadro quieto cae dentro de su beat", () => {
    for (let i = 0; i < 6; i++) {
      const mid = (i + 0.5) / 6;
      expect(stepOpacity(mid, i)).toBe(1);
      for (let j = 0; j < 6; j++) if (j !== i) expect(stepOpacity(mid, j)).toBe(0);
      expect(activeBeat(beatHold(i))).toBe(i);
    }
  });

  it("lenguaje honesto: ninguna palabra prohibida (D-15)", () => {
    const text = HOW_STEPS.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    for (const w of ["anónim", "secret", "100 %", "100%", "imposible", "inhackeable"]) expect(text).not.toContain(w);
  });
});
