// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leaderOf, LiveBreakdown } from "@/components/org/LiveBreakdown";
import { hmsText } from "@/components/org/VotingBoard";
import { ElectionComposer, eligibilitySummary, parseParticipants, PUBLISH_ROOM } from "@/components/org/ElectionComposer";
import { apiV1 } from "@/lib/client/apiV1";
import { compressOptionImage, OptionImageError } from "@/lib/client/optionImage";
import { DEFAULT_ELIGIBILITY } from "@/components/org/EligibilityPicker";
import { inMinutes, whatsappHref } from "@/components/org/ReadyScreen";
import { isoForTime } from "@/components/org/StartTimePicker";
import { cockpitPhase } from "@/components/org/OrgPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
// Foto de opción: el recorte/compresión usa canvas (no existe en jsdom); se simula la data URI resultante.
vi.mock("@/lib/client/optionImage", async (orig) => ({ ...(await orig<typeof import("@/lib/client/optionImage")>()), compressOptionImage: vi.fn(async () => "data:image/jpeg;base64,/9j/fixture") }));
vi.mock("@/lib/client/apiV1", () => ({
  apiV1: {
    createElection: vi.fn(async (body: { title: string }) => ({ id: "el-fixture", title: body.title, organizerToken: "org-token-fixture" })),
    addVoters: vi.fn(async () => ({ voters: [] })),
    publish: vi.fn(async () => ({})),
  },
}));
vi.mock("@/lib/client/room", async (orig) => ({ ...(await orig<typeof import("@/lib/client/room")>()), roomApi: { open: vi.fn(async () => ({})) } }));

afterEach(cleanup);

const tally = (counts: (number | null)[], total: number) => ({
  electionId: "el-1",
  turnout: total / 10,
  totalVotes: total,
  eligible: 10,
  leadingShare: null,
  closesAt: "2026-10-24T22:00:00.000Z",
  status: "open" as const,
  options: counts.map((count, i) => ({ id: `o${i}`, label: `Opción ${i + 1}`, count })),
});

describe("crear votación (una pantalla)", () => {
  it("«Quién vota»: texto completo para lectores de pantalla y tests", () => {
    expect(eligibilitySummary(DEFAULT_ELIGIBILITY)).toBe("Credencial del evento (comprobación en vivo) + rostro");
    expect(eligibilitySummary({ ...DEFAULT_ELIGIBILITY, badgeCheck: "list" })).toBe("Credencial del evento (comprobación con lista) + rostro");
    expect(eligibilitySummary({ ...DEFAULT_ELIGIBILITY, method: "open-alias" })).toBe("Apodo libre + rostro");
  });
  it("invitados pegados: nombre y teléfono opcional, ignora líneas vacías", () => {
    expect(parseParticipants("Vecina A, +584121111111\n\n  Vecino B  \n,+58")).toEqual([
      { displayName: "Vecina A", phoneE164: "+584121111111" },
      { displayName: "Vecino B", phoneE164: "" },
    ]);
  });
  it("la sala al publicar: 60 lugares, 15 minutos", () => {
    expect(PUBLISH_ROOM).toEqual({ maxSeats: 60, expiresInMin: 15 });
  });
});

describe("opciones con foto y subtítulo (plantilla «Varias opciones»)", () => {
  const photo = new File(["fixture"], "foto.jpg", { type: "image/jpeg" });

  it("subtítulo e imagen viajan en el payload; sin claves vacías en la opción sin ellos", async () => {
    vi.mocked(apiV1.createElection).mockClear();
    render(<ElectionComposer />);
    fireEvent.change(screen.getByLabelText("Pregunta de la votación"), { target: { value: "Vocería del comité (ficticia)" } });
    fireEvent.change(screen.getByTestId("option-input-0"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByTestId("option-subtitle-0"), { target: { value: "  Tesorera  " } });
    fireEvent.change(screen.getByTestId("option-input-1"), { target: { value: "Luis" } });
    fireEvent.change(screen.getByTestId("option-file-0"), { target: { files: [photo] } });
    await waitFor(() => expect(screen.getByTestId("option-image-0").getAttribute("src")).toBe("data:image/jpeg;base64,/9j/fixture"));
    expect(vi.mocked(compressOptionImage)).toHaveBeenCalledWith(photo);
    // La vista previa muestra lo mismo que verá el votante: foto, nombre y subtítulo.
    expect(screen.getByTestId("preview-option-0").textContent).toContain("Tesorera");
    expect(screen.getByTestId("preview-option-0").querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,/9j/fixture");

    fireEvent.click(screen.getByTestId("publish"));
    await waitFor(() => expect(apiV1.createElection).toHaveBeenCalledTimes(1));
    const body = vi.mocked(apiV1.createElection).mock.calls[0]![0];
    expect(body.options).toEqual([
      { id: "opt-1-ana", label: "Ana", subtitle: "Tesorera", image: "data:image/jpeg;base64,/9j/fixture" },
      { id: "opt-2-luis", label: "Luis" },
    ]);
    expect("subtitle" in body.options[1]!).toBe(false);
    expect("image" in body.options[1]!).toBe(false);
  });

  it("«×» quita la foto y vuelve la inicial; el error de compresión se muestra en español", async () => {
    render(<ElectionComposer />);
    fireEvent.change(screen.getByTestId("option-input-0"), { target: { value: "Ana" } });
    expect(screen.getByTestId("option-avatar-0").textContent).toBe("A");
    fireEvent.change(screen.getByTestId("option-file-0"), { target: { files: [photo] } });
    await screen.findByTestId("option-image-0");
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto de la opción A" }));
    expect(screen.queryByTestId("option-image-0")).toBeNull();
    expect(screen.getByTestId("option-avatar-0").textContent).toBe("A");

    vi.mocked(compressOptionImage).mockRejectedValueOnce(new OptionImageError("Elige una imagen (JPG, PNG o WebP)."));
    fireEvent.change(screen.getByTestId("option-file-0"), { target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByTestId("option-image-error").textContent).toBe("Elige una imagen (JPG, PNG o WebP)."));
    expect(screen.queryByTestId("option-image-0")).toBeNull();
  });

  it("Sí/No y 1 a 5: sin avatar ni subtítulo; «Varias opciones» los trae de vuelta", () => {
    render(<ElectionComposer />);
    expect(screen.getAllByTestId(/^option-avatar-/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Sí / No" }));
    expect(screen.getByTestId("option-input-0")).toHaveProperty("value", "Sí");
    expect(screen.queryAllByTestId(/^option-avatar-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^option-subtitle-/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "1 a 5" }));
    expect(screen.queryAllByTestId(/^option-avatar-/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Varias opciones" }));
    expect(screen.getAllByTestId(/^option-avatar-/)).toHaveLength(2);
    expect(screen.getAllByTestId(/^option-subtitle-/)).toHaveLength(2);
  });
});

describe("¡Listo! Comparte", () => {
  it("«en N min» legible", () => {
    expect(inMinutes(30_000)).toBe("en menos de 1 min");
    expect(inMinutes(14 * 60_000 + 1)).toBe("en 15 min");
    expect(inMinutes(65 * 60_000)).toBe("en 1 h 05 min");
  });
  it("WhatsApp: wa.me con el título y el enlace (no envía nada)", () => {
    const href = whatsappHref("Asamblea (ficticia)", "https://x.test/j/ABC234");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toBe("Vota en «Asamblea (ficticia)»: https://x.test/j/ABC234");
  });
  it("hora exacta: hoy, o mañana si ya pasó", () => {
    const now = new Date(2026, 9, 24, 18, 30);
    expect(new Date(isoForTime("19:05", now)!).getHours()).toBe(19);
    expect(new Date(isoForTime("19:05", now)!).getDate()).toBe(24);
    expect(new Date(isoForTime("08:00", now)!).getDate()).toBe(25);
    expect(isoForTime("nada", now)).toBeNull();
  });
});

describe("panel cabina", () => {
  it("píldora de fase con los nombres acordados", () => {
    expect(cockpitPhase.registration.label).toBe("Inscripción abierta");
    expect(cockpitPhase.open.label).toBe("Votación en curso");
    expect(cockpitPhase.closed.label).toBe("Cerrada");
    expect(cockpitPhase.auditable.label).toBe("Auditable");
    expect(cockpitPhase.drawn.label).toBe("Sorteada");
    expect(cockpitPhase.failed.label).toBe("Fallida");
  });
  it("LiveBreakdown: con count null no desglosa: barras fantasma y «1 de 2 votos · se publica desde 2»", () => {
    render(<LiveBreakdown tally={tally([null, null], 1)} />);
    const box = screen.getByTestId("live-breakdown");
    expect(box.textContent).toContain("1 de 2 votos");
    expect(box.textContent).toContain("Se publica desde 2 votos");
    expect(box.querySelector("table")).toBeNull();
    expect(screen.getByTestId("live-leader").textContent).toBe("Por opción");
  });
  it("LiveBreakdown: ranking de mayor a menor, «Va ganando», tabla para lectores de pantalla, sin «verificado»", () => {
    render(<LiveBreakdown tally={tally([1, 3, 2], 6)} />);
    const box = screen.getByTestId("live-breakdown");
    expect(Array.from(box.querySelectorAll("tbody th")).map((t) => t.textContent)).toEqual(["Opción 2", "Opción 3", "Opción 1"]);
    expect(screen.getByTestId("live-leader").textContent).toBe("Va ganandoOpción 2por 1 voto");
    expect(box.textContent).toMatch(/50\s?%/);
    expect(box.textContent).toContain("Preliminar · se confirma al cerrar");
    expect(box.textContent).not.toMatch(/\bverificado\b/i); // nunca «verificado» desde el panel
  });
  it("líder: ventaja, empate y sin votos", () => {
    const r = (c: number[]) => c.map((count, i) => ({ id: `o${i}`, label: String(i + 1), count }));
    expect(leaderOf(r([2, 8, 4]))).toEqual({ kind: "lead", label: "2", margin: 4 });
    expect(leaderOf(r([3, 5, 5]))).toEqual({ kind: "tie", labels: ["2", "3"] });
    expect(leaderOf(r([0, 0]))).toBeNull();
  });
  it("marcador: siempre H:MM:SS", () => {
    expect(hmsText(97 * 60_000 + 5_000)).toBe("1:37:05");
    expect(hmsText(65_000)).toBe("0:01:05");
    expect(hmsText(-5)).toBe("0:00:00");
  });
});
