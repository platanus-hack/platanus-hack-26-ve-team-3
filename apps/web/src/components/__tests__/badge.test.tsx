// @vitest-environment jsdom
/**
 * D-19 — escáner de la credencial: decodificación de una imagen QR generada (jsqr), selección BarcodeDetector/jsqr,
 * flujo /j en modo credencial (cámara simulada), cámara negada (sin alternativa tecleada), errores y selector del organizador.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BADGE_CONSENT_EXTRA, CAMERA_COPY } from "@/components/room/BadgeJoin";
import { RoomJoin } from "@/components/room/RoomJoin";
import { CONSENT_LINK_LABEL } from "@/components/voter/Consent";
import { DEFAULT_ELIGIBILITY, EligibilityPicker, eligibilityInputOf, parseAllowlist } from "@/components/org/EligibilityPicker";
import { badgeUrlFromTyped, classifyBadgeError, createQrDetector, decodeQrRgba } from "@/lib/client/badge";
import { ApiClientError } from "@/lib/client/api";
import { loadRoomJoin } from "@/lib/client/room";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
// La precarga de Human no aplica en jsdom.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const BADGE = "https://hack.platan.us/26-ve/id/jgalvis414";

/** Imagen RGBA de un QR (negro sobre blanco, margen de 4 módulos), como un cuadro de cámara. */
function qrRgba(text: string, scale = 6) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const side = (n + 8) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + 4) * scale + y) * side + (c + 4) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, side };
}

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown };
function mockFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const { status, body } = handler(url, init);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}
const future = () => new Date(Date.now() + 10 * 60_000).toISOString();
const info = { electionId: "el-1", title: "Votación Platanus (fixture)", open: true, seatsTaken: 3, maxSeats: 120, expiresAt: future(), closedReason: null, eligibility: { method: "event-badge", badgeUrlPrefix: "https://hack.platan.us/26-ve/id/" } };
const joined = { electionId: "el-1", voterId: "vt-9", displayName: "Participante", inviteToken: "tok-badge", inviteUrl: "http://x/v/tok-badge" };

/** Cámara simulada: getUserMedia con pistas detenibles y BarcodeDetector que va devolviendo `reads`. */
function fakeCamera(reads: (string | null)[], opts: { deny?: boolean } = {}) {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async () => {
    if (opts.deny) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    return { getTracks: () => [{ stop }] } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
  let i = 0;
  class FakeDetector {
    static async getSupportedFormats() {
      return ["qr_code"];
    }
    async detect() {
      const v = reads[Math.min(i++, reads.length - 1)];
      return v ? [{ rawValue: v }] : [];
    }
  }
  vi.stubGlobal("BarcodeDetector", FakeDetector);
  return { stop, getUserMedia };
}

beforeEach(() => {
  localStorage.clear();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lectura del QR", () => {
  it("jsqr decodifica una imagen QR generada con la URL real de la credencial", async () => {
    const { data, side } = qrRgba(BADGE);
    expect(await decodeQrRgba(data, side, side)).toBe(BADGE);
  });
  it("una imagen sin QR → null", async () => {
    const side = 120;
    expect(await decodeQrRgba(new Uint8ClampedArray(side * side * 4).fill(255), side, side)).toBeNull();
  });
  it("usa BarcodeDetector nativo si sabe leer qr_code; si no, jsqr", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); // jsdom no trae canvas
    vi.stubGlobal("BarcodeDetector", class { static async getSupportedFormats() { return ["qr_code"]; } async detect() { return []; } });
    expect((await createQrDetector()).kind).toBe("native");
    vi.stubGlobal("BarcodeDetector", class { static async getSupportedFormats() { return ["ean_13"]; } async detect() { return []; } });
    expect((await createQrDetector()).kind).toBe("jsqr");
    vi.stubGlobal("BarcodeDetector", undefined);
    expect((await createQrDetector()).kind).toBe("jsqr");
  });
  it("usuario escrito → URL de la credencial (usuario, @usuario o la URL)", () => {
    expect(badgeUrlFromTyped("jgalvis414")).toBe(BADGE);
    expect(badgeUrlFromTyped(" @jgalvis414 ")).toBe(BADGE);
    expect(badgeUrlFromTyped(BADGE)).toBe(BADGE);
    expect(badgeUrlFromTyped("no vale")).toBeNull();
  });
  it("errores del servidor → textos del producto", () => {
    expect(classifyBadgeError(new ApiClientError("x", "badge_used", 409)).message).toBe("Esta credencial ya se usó en esta votación.");
    expect(classifyBadgeError(new ApiClientError("x", "badge_unknown", 404)).message).toBe("No encontramos esta credencial en el evento.");
    expect(classifyBadgeError(new ApiClientError("x", "badge_invalid", 400)).message).toBe("Ese QR no es una credencial de Platanus Hack.");
    expect(classifyBadgeError(new ApiClientError("La sala está llena", "room_full", 409)).kind).toBe("full");
  });
});

describe("/j en modo credencial", () => {
  it("un botón grande; sin jerga; consentimiento propio de la credencial", async () => {
    mockFetch(() => ({ status: 200, body: info }));
    render(<RoomJoin roomCode="ABC234" />);
    expect(await screen.findByText("Votación Platanus (fixture)")).toBeTruthy();
    expect(screen.getByTestId("step-indicator").textContent).toContain("Paso 1 de 2");
    expect(screen.getByRole("button", { name: "Escanear mi credencial" })).toBeTruthy();
    expect(screen.queryByLabelText("Tu nombre o apodo")).toBeNull();
    // Un solo enlace, plegado; la frase de aceptación y los detalles viven dentro.
    expect(screen.getByText(CONSENT_LINK_LABEL)).toBeTruthy();
    expect(screen.getByTestId("voter-consent").textContent).toContain("Al tocar Escanear mi credencial, aceptas.");
    expect(screen.getByText(/Al tocar Escanear mi credencial/).closest("details")).toBeTruthy();
    expect(screen.getByTestId("consent-details").textContent).toContain(BADGE_CONSENT_EXTRA[0]);
    expect(screen.queryByText("o escribe tu usuario")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.body.textContent).not.toMatch(/wallet|blockchain|semaphore|hmac/i);
  });

  it("escanear: QR ajeno → aviso y sigue leyendo; credencial → entra sola, apaga la cámara y va a /v/<token>", async () => {
    const calls = mockFetch((url) => (url.endsWith("/join-badge") ? { status: 201, body: joined } : { status: 200, body: info }));
    const cam = fakeCamera([null, "https://example.com/menu", BADGE]);
    render(<RoomJoin roomCode="ABC234" />);
    fireEvent.click(await screen.findByRole("button", { name: "Escanear mi credencial" }));
    expect(await screen.findByTestId("badge-scanner")).toBeTruthy();
    await waitFor(() => expect(cam.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: "environment" } }) })));
    expect(await screen.findByText("Ese QR no es una credencial de Platanus Hack.")).toBeTruthy();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/v/tok-badge"), { timeout: 3000 });
    const req = calls.find((c) => c.url.endsWith("/join-badge"));
    expect(req?.url).toBe("/api/rooms/ABC234/join-badge");
    expect(JSON.parse(String(req?.init?.body))).toEqual({ badgeUrl: BADGE });
    await waitFor(() => expect(cam.stop).toHaveBeenCalled());
    const stored = loadRoomJoin("ABC234");
    expect(stored?.inviteToken).toBe("tok-badge");
    expect(stored?.consentAt).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith("/join-badge"))).toHaveLength(1);
  });

  it("credencial ya usada → mensaje claro y 'Escanear otra vez'", async () => {
    mockFetch((url) => (url.endsWith("/join-badge") ? { status: 409, body: { code: "badge_used", error: "Esta credencial ya se usó en esta votación." } } : { status: 200, body: info }));
    fakeCamera([BADGE]);
    render(<RoomJoin roomCode="ABC234" />);
    fireEvent.click(await screen.findByRole("button", { name: "Escanear mi credencial" }));
    expect(await screen.findByText("Esta credencial ya se usó en esta votación.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escanear otra vez" })).toBeTruthy();
    expect(screen.queryByTestId("badge-scanner")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("sin permiso de cámara → pide permitir la cámara y 'Escanear otra vez'; no hay usuario tecleado", async () => {
    const calls = mockFetch(() => ({ status: 200, body: info }));
    fakeCamera([], { deny: true });
    render(<RoomJoin roomCode="ABC234" />);
    fireEvent.click(await screen.findByRole("button", { name: "Escanear mi credencial" }));
    expect((await screen.findByTestId("badge-notice")).textContent).toBe(CAMERA_COPY.denied);
    expect(CAMERA_COPY.denied).toMatch(/Permite el acceso a la cámara/);
    expect(CAMERA_COPY.denied).toMatch(/Escanear otra vez/);
    expect(screen.getByRole("button", { name: "Escanear otra vez" })).toBeTruthy();
    expect(screen.queryByText("o escribe tu usuario")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull();
    expect(screen.queryByTestId("badge-scanner")).toBeNull();
    expect(calls.some((c) => c.url.endsWith("/join-badge"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("credencial desconocida (404) → mensaje claro y 'Escanear otra vez'", async () => {
    const calls = mockFetch((url) => (url.endsWith("/join-badge") ? { status: 404, body: { code: "badge_unknown", error: "No encontramos esta credencial en el evento." } } : { status: 200, body: info }));
    fakeCamera(["https://hack.platan.us/26-ve/id/nadie"]);
    render(<RoomJoin roomCode="ABC234" />);
    fireEvent.click(await screen.findByRole("button", { name: "Escanear mi credencial" }));
    expect(await screen.findByText("No encontramos esta credencial en el evento.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escanear otra vez" })).toBeTruthy();
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/join-badge"))?.init?.body))).toEqual({ badgeUrl: "https://hack.platan.us/26-ve/id/nadie" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("selector del organizador", () => {
  it("Credencial por defecto; sin opción de rostro", () => {
    const onChange = vi.fn();
    render(<EligibilityPicker value={DEFAULT_ELIGIBILITY} onChange={onChange} />);
    expect((screen.getByRole("radio", { name: /Credencial del evento/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/Verificación de rostro/)).toBeNull();
    expect(screen.getByText(/Siempre se comprueba el rostro/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Apodo libre/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ method: "open-alias" }));
  });
  it("lista: acepta usuario, @usuario y URL; deduplica; rechaza basura", () => {
    expect(parseAllowlist(`ana\n@Beto, ${BADGE}\nana`, DEFAULT_ELIGIBILITY.prefix)).toEqual({ users: ["ana", "beto", "jgalvis414"], bad: [] });
    expect(parseAllowlist("ok mal_usuario", DEFAULT_ELIGIBILITY.prefix).bad).toEqual(["mal_usuario"]);
    expect(eligibilityInputOf({ ...DEFAULT_ELIGIBILITY, badgeCheck: "list", allowlist: "" }).ok).toBe(false);
    expect(eligibilityInputOf({ ...DEFAULT_ELIGIBILITY, badgeCheck: "list", allowlist: "ana" })).toEqual({ ok: true, value: { method: "event-badge", badgeCheck: "list", badgeUrlPrefix: DEFAULT_ELIGIBILITY.prefix, badgeAllowlist: ["ana"] } });
    expect(eligibilityInputOf({ ...DEFAULT_ELIGIBILITY, prefix: "http://x/" }).ok).toBe(false);
  });
});
