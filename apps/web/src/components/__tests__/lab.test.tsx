// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlterationDiff } from "@/components/audit/AlterationDiff";
import { AttackLab } from "@/components/audit/AttackLab";
import { VerdictBanner } from "@/components/audit/VerdictBanner";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

const WEB = path.resolve(__dirname, "../../..");
const fixtureBytes = readFileSync(path.join(WEB, "public/fixtures/protocol/lab-drawn.json"));

beforeEach(() => {
  search = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/fixtures/protocol/lab-drawn.json")) return new Response(fixtureBytes, { status: 200 });
      return new Response("not found", { status: 404 });
    }),
  );
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VerdictBanner", () => {
  it("rotula los tres estados honestos con texto, no solo color", () => {
    const { rerender } = render(<VerdictBanner status="fallo detectado" />);
    expect(screen.getByTestId("verdict-banner").textContent).toMatch(/Fallo detectado/);
    rerender(<VerdictBanner status="no verificable" />);
    expect(screen.getByTestId("verdict-banner").textContent).toMatch(/No verificable/);
    rerender(<VerdictBanner status="verificado" />);
    expect(screen.getByTestId("verdict-banner").getAttribute("data-status")).toBe("verificado");
  });
});

describe("AlterationDiff", () => {
  it("separa lo alterado de lo recalculado", () => {
    render(
      <AlterationDiff
        changes={[
          { path: "tally.counts[0]", before: "1", after: "2", kind: "tamper" },
          { path: "tallyHash", before: "0xaa", after: "0xbb", kind: "recomputed" },
        ]}
      />,
    );
    expect(screen.getByText("Lo que alteró el jurado")).toBeTruthy();
    expect(screen.getByText("Lo que se recalculó para disimular")).toBeTruthy();
    expect(screen.getByText("tally.counts[0]")).toBeTruthy();
  });
});

describe("AttackLab con el verificador REAL", () => {
  it("carga el fixture etiquetado, verifica el original y un toque en «Inflar el resultado» ⇒ FALLO DETECTADO en tally_matches", async () => {
    render(<AttackLab />);
    expect(await screen.findByText("ejemplo")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("baseline-status").textContent).toMatch(/verificado/), { timeout: 30_000 });
    // El fixture v1 del laboratorio trae sorteo: sus alteraciones están disponibles; ocultar la sala no (no hay sala).
    expect((screen.getByTestId("alt-draw-seed") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("alt-room-hide") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("alt-tally-inflate"));
    await waitFor(() => expect(screen.getByTestId("lab-result").getAttribute("data-verdict")).toBe("detectado"), { timeout: 30_000 });
    expect(screen.getByTestId("verdict-banner").getAttribute("data-status")).toBe("fallo detectado");
    expect(document.querySelector('[data-check="tally_matches"]')?.getAttribute("data-status")).toBe("fallo detectado");
    expect(screen.getByTestId("alteration-diff").textContent).toContain("tally.counts[0]");
  }, 60_000);

  it("«Quitar un voto y rehacer todo» sin ancla: el verificador no lo detecta y la UI lo dice", async () => {
    render(<AttackLab />);
    await waitFor(() => expect(screen.getByTestId("baseline-status").textContent).toMatch(/verificado/), { timeout: 30_000 });
    fireEvent.click(screen.getByTestId("alt-drop-rechain"));
    await waitFor(() => expect(screen.getByTestId("lab-result").getAttribute("data-verdict")).toBe("no-detectable"), { timeout: 30_000 });
    expect(screen.getByTestId("lab-evaluation").textContent).toMatch(/Sin ancla/);
  }, 60_000);

  it("«Cambiar un ganador del sorteo» ⇒ FALLO DETECTADO en draw_matches", async () => {
    render(<AttackLab />);
    await waitFor(() => expect(screen.getByTestId("baseline-status").textContent).toMatch(/verificado/), { timeout: 30_000 });
    fireEvent.click(screen.getByTestId("alt-draw-winner"));
    await waitFor(() => expect(screen.getByTestId("lab-result").getAttribute("data-verdict")).toBe("detectado"), { timeout: 30_000 });
    expect(document.querySelector('[data-check="draw_matches"]')?.getAttribute("data-status")).toBe("fallo detectado");
  }, 60_000);
});
