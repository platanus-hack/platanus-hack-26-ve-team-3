// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qrPath } from "@/components/room/QrCode";
import { JOIN_PURPOSE_LABEL, JOIN_PURPOSE_POINTS, JOIN_SUBTITLE, ROOM_CONSENT_EXTRA, RoomJoin } from "@/components/room/RoomJoin";
import { CONSENT_DETAILS, CONSENT_LINK_LABEL, CONSENT_SHORT } from "@/components/voter/Consent";
import { RoomCard } from "@/components/room/RoomCard";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { saveOrgToken } from "@/lib/client/orgStore";
import { basescanTxUrl, classifyJoinError, invitePathFrom, loadRoomJoin, roomGate, roomJoinForToken, validateAlias } from "@/lib/client/room";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

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
const info = (over: Record<string, unknown> = {}) => ({ electionId: "el-1", title: "Asamblea ficticia (fixture)", open: true, seatsTaken: 3, maxSeats: 60, expiresAt: future(), closedReason: null, ...over });
/** Foto de opción (fixture): PNG de 1×1, con la forma que exige `OptionImage`. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const OPTIONS = [
  { id: "ana", label: "Ana", subtitle: "Tesorera (fixture)", image: PNG },
  { id: "beto", label: "Beto" },
  { id: "carla", label: "Carla", subtitle: "Vocal (fixture)" },
];
/** Lo que no se promete en /j (reglas duras 1 y 5). */
const FORBIDDEN = /anónim|secreto|identidad verificada|100 ?%|wallet|blockchain|semaphore/i;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("alias (misma validación que el backend)", () => {
  it("acepta alias normales y normaliza espacios", () => {
    expect(validateAlias("  Vecina   Ana ")).toEqual({ ok: true, value: "Vecina Ana" });
    expect(validateAlias("Piso-3 O'Neil_2").ok).toBe(true);
  });
  it("rechaza vacío, >32, símbolos y ≥7 dígitos", () => {
    expect(validateAlias("   ").ok).toBe(false);
    expect(validateAlias("a".repeat(33)).ok).toBe(false);
    expect(validateAlias("ana@correo").ok).toBe(false);
    const phone = validateAlias("0412 555 1234");
    expect(phone.ok).toBe(false);
    if (!phone.ok) expect(phone.error).toMatch(/teléfono/);
    expect(validateAlias("Apto 123456").ok).toBe(true); // 6 dígitos sí
  });
});

describe("errores del join y estado de la sala", () => {
  it("409 → llena, 410 → cerrada con el texto del servidor, 429 → espera", () => {
    expect(classifyJoinError(new ApiClientError("La sala está llena (60 de 60)", "room_full", 409)).kind).toBe("full");
    const c = classifyJoinError(new ApiClientError("La sala expiró", "room_closed", 410));
    expect(c).toEqual({ kind: "closed", message: "La sala expiró" });
    expect(classifyJoinError(new ApiClientError("Demasiadas", "forbidden", 429)).kind).toBe("rate");
    expect(classifyJoinError(new ApiClientError("x", "invalid_input", 400)).kind).toBe("alias");
  });
  it("roomGate: llena aunque esté abierta; razones de cierre del servidor", () => {
    expect(roomGate(info())).toBe("open");
    expect(roomGate(info({ seatsTaken: 60 }))).toBe("full");
    expect(roomGate(info({ open: false, closedReason: "election-opened" }))).toBe("election-opened");
    expect(roomGate(info({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).toBe("expired");
  });
  it("invitePathFrom usa la ruta local aunque APP_URL sea otro host", () => {
    expect(invitePathFrom("http://192.168.0.5:3000/v/abc123", "abc123")).toBe("/v/abc123");
    expect(invitePathFrom("basura", "tok")).toBe("/v/tok");
  });
  it("basescan sólo para tx válidas en Base / Base Sepolia", () => {
    const tx = `0x${"ab".repeat(32)}`;
    expect(basescanTxUrl(84532, tx)).toBe(`https://sepolia.basescan.org/tx/${tx}`);
    expect(basescanTxUrl(8453, tx)).toBe(`https://basescan.org/tx/${tx}`);
    expect(basescanTxUrl(1, tx)).toBeNull();
    expect(basescanTxUrl(84532, "0x12")).toBeNull();
  });
});

describe("RoomJoin (/j/[roomCode])", () => {
  it("paso 1 de 2 en una pantalla: título, 'La entrada cierra en …', nombre o apodo, un enlace 'Cómo usamos tu cámara' plegado, un botón; sin contador de lugares", async () => {
    mockFetch(() => ({ status: 200, body: info() }));
    render(<RoomJoin roomCode="abc234" />);
    expect(await screen.findByText("Asamblea ficticia (fixture)")).toBeTruthy();
    expect(screen.getByTestId("step-indicator").textContent).toContain("Paso 1 de 2");
    expect(screen.getByTestId("room-closes-in").textContent).toMatch(/^La entrada cierra en \d+:\d{2}$/);
    expect(screen.queryByTestId("room-seats")).toBeNull();
    expect(document.body.textContent).not.toMatch(/lugares/);
    expect(screen.getByLabelText("Tu nombre o apodo")).toBeTruthy();
    expect(screen.getByText(CONSENT_LINK_LABEL)).toBeTruthy();
    expect(screen.queryByText("Más detalles")).toBeNull();
    expect(screen.getByTestId("voter-consent").textContent).toContain(CONSENT_SHORT);
    expect(screen.getByText(/Usamos tu cámara para comprobar/).closest("details")).toBeTruthy();
    const consent = screen.getByTestId("consent-details").textContent ?? "";
    expect(consent).toContain("se borra al abrir la votación");
    expect(consent).toContain("no revela cuál inscrito emitió cada boleta");
    expect(consent).toContain("El servidor sí ve el contenido");
    expect(consent).toContain(ROOM_CONSENT_EXTRA[0]);
    for (const p of [CONSENT_SHORT, ...CONSENT_DETAILS, ...ROOM_CONSENT_EXTRA]) expect(p).not.toMatch(/anónim|secreto|100 ?%|wallet|credencial/i);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // Servidor viejo sin `options`: no hay vista previa (nunca una tarjeta vacía).
    expect(screen.queryByTestId("ballot-preview")).toBeNull();
  });

  it("subtítulo + «¿Para qué me inscribo?» plegado (3 viñetas honestas, sin palabras prohibidas) y vista previa de la boleta de solo lectura con foto, inicial y subtítulo", async () => {
    mockFetch(() => ({ status: 200, body: info({ options: OPTIONS }) }));
    render(<RoomJoin roomCode="ABC234" />);
    const preview = await screen.findByTestId("ballot-preview");
    // Debajo del título: la línea corta y el desplegable (plegado), con las viñetas del modo apodo.
    expect(screen.getByTestId("join-subtitle").textContent).toBe(JOIN_SUBTITLE);
    const purpose = screen.getByTestId("join-purpose") as HTMLDetailsElement;
    expect(purpose.tagName).toBe("DETAILS");
    expect(purpose.open).toBe(false);
    expect(within(purpose).getByText(JOIN_PURPOSE_LABEL)).toBeTruthy();
    const points = within(purpose).getAllByRole("listitem").map((li) => li.textContent);
    expect(points).toEqual([...JOIN_PURPOSE_POINTS["open-alias"]]);
    expect(points[0]).toMatch(/no te inscribes dos veces/);
    expect(points[0]).toMatch(/No guardamos fotos/);
    expect(points[1]).toMatch(/comprobante que no muestra tu opción/);
    expect(points[2]).toMatch(/El servidor sí ve cada boleta/);
    for (const p of [JOIN_SUBTITLE, JOIN_PURPOSE_LABEL, ...JOIN_PURPOSE_POINTS["open-alias"], ...JOIN_PURPOSE_POINTS["event-badge"]]) expect(p).not.toMatch(FORBIDDEN);
    // En modo apodo no se habla de credencial.
    for (const p of JOIN_PURPOSE_POINTS["open-alias"]) expect(p).not.toMatch(/credencial/i);
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
    // «Así es la boleta»: pregunta + tarjetas; foto o inicial; subtítulo; solo lectura (sin radios, sigue habiendo un solo botón).
    expect(within(preview).getByText("Así es la boleta")).toBeTruthy();
    expect(within(preview).getByTestId("preview-question").textContent).toBe("Asamblea ficticia (fixture)");
    const cards = within(preview).getAllByTestId("preview-option");
    expect(cards.map((c) => c.textContent)).toEqual(["AnaTesorera (fixture)", "BBeto", "CCarlaVocal (fixture)"]);
    expect(cards[0]!.querySelector("img")?.getAttribute("src")).toBe(PNG);
    expect(within(cards[0]!).getByTestId("preview-subtitle").textContent).toBe("Tesorera (fixture)");
    expect(cards[1]!.querySelector("img")).toBeNull();
    expect(within(cards[1]!).getByTestId("preview-avatar").textContent).toBe("B");
    expect(within(cards[1]!).queryByTestId("preview-subtitle")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // Orden: título → subtítulo/desplegable → vista previa → nombre → Continuar.
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(screen.getByRole("heading", { level: 1 }), purpose)).toBe(true);
    expect(after(purpose, preview)).toBe(true);
    expect(after(preview, screen.getByLabelText("Tu nombre o apodo"))).toBe(true);
    expect(after(preview, screen.getByRole("button", { name: "Continuar" }))).toBe(true);
    // Siguen los testids/estados de antes.
    expect(screen.getByTestId("room-closes-in").textContent).toMatch(/^La entrada cierra en \d+:\d{2}$/);
    expect(screen.getByText(CONSENT_LINK_LABEL)).toBeTruthy();
  });

  it("valida el nombre o apodo antes de llamar al servidor", async () => {
    const calls = mockFetch(() => ({ status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Tu nombre o apodo"), { target: { value: "04125551234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/No uses tu teléfono/)).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/join"))).toBe(false);
  });

  it("join → guarda el token en este teléfono y redirige a /v/<token>", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/join")
        ? { status: 201, body: { electionId: "el-1", voterId: "vt-1", displayName: "Ana", inviteToken: "tok-123", inviteUrl: "http://otro-host/v/tok-123" } }
        : { status: 200, body: info() },
    );
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Tu nombre o apodo"), { target: { value: " Ana " } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/v/tok-123"));
    const join = calls.find((c) => c.url.endsWith("/join"));
    expect(JSON.parse(String(join?.init?.body))).toEqual({ displayName: "Ana" });
    expect(loadRoomJoin("abc234")?.inviteToken).toBe("tok-123");
    expect(roomJoinForToken("tok-123")?.consentAt).toBeTruthy();
  });

  it("si ya entró desde este teléfono, ofrece continuar (no pide otro lugar)", async () => {
    localStorage.setItem("quorum.room.ABC234", JSON.stringify({ roomCode: "ABC234", electionId: "el-1", voterId: "vt-1", displayName: "Ana", inviteToken: "tok-1", invitePath: "/v/tok-1", joinedAt: "x", consentAt: "x" }));
    mockFetch(() => ({ status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    const resume = await screen.findByTestId("room-resume");
    fireEvent.click(within(resume).getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/v/tok-1");
  });

  it("sala llena → modo observador", async () => {
    mockFetch(() => ({ status: 200, body: info({ seatsTaken: 60 }) }));
    render(<RoomJoin roomCode="ABC234" />);
    expect(await screen.findByText("La sala está llena")).toBeTruthy();
    const obs = screen.getByTestId("observer-mode");
    expect(obs.querySelector('a[href="/e/el-1/live"]')).toBeTruthy();
    expect(obs.querySelector('a[href="/e/el-1/draw"]')).toBeTruthy();
    expect(screen.queryByLabelText("Tu nombre o apodo")).toBeNull();
  });

  it("votación ya comenzó → observador; 410 al entrar muestra el texto del servidor", async () => {
    mockFetch(() => ({ status: 200, body: info({ open: false, closedReason: "election-opened" }) }));
    render(<RoomJoin roomCode="ABC234" />);
    expect(await screen.findByText("La votación ya comenzó")).toBeTruthy();
    cleanup();

    mockFetch((url) => (url.endsWith("/join") ? { status: 410, body: { error: "La sala expiró", code: "room_closed" } } : { status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Tu nombre o apodo"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/La sala expiró\./)).toBeTruthy();
    expect(screen.getByTestId("observer-mode")).toBeTruthy();
  });

  it("429 → mensaje de espera, sigue el formulario", async () => {
    mockFetch((url) => (url.endsWith("/join") ? { status: 429, body: { error: "Demasiadas solicitudes", code: "forbidden" } } : { status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Tu nombre o apodo"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Espera un momento")).toBeTruthy();
    expect(screen.getByLabelText("Tu nombre o apodo")).toBeTruthy();
  });

  it("código inexistente → sala no encontrada", async () => {
    mockFetch(() => ({ status: 404, body: { error: "Sala no encontrada", code: "not_found" } }));
    render(<RoomJoin roomCode="ZZZZZZ" />);
    expect(await screen.findByText("Sala no encontrada")).toBeTruthy();
  });
});

describe("RoomCard (panel del organizador)", () => {
  it("con token: muestra código y joinUrl (Bearer) y abre con tope y minutos", async () => {
    saveOrgToken("el-1", "org-tok-xyz");
    let opened = false;
    const calls = mockFetch((url, init) => {
      if (init?.method === "POST") {
        opened = true;
        return { status: 201, body: { open: true, seatsTaken: 0, maxSeats: 40, expiresAt: future(), closedReason: null, roomCode: "ABC234", joinUrl: "http://sala.test/j/ABC234" } };
      }
      return { status: 200, body: opened ? { open: true, seatsTaken: 0, maxSeats: 40, expiresAt: future(), closedReason: null, roomCode: "ABC234", joinUrl: "http://sala.test/j/ABC234" } : { open: false, seatsTaken: 0, maxSeats: null, expiresAt: null, closedReason: null } };
    });
    render(<RoomCard electionId="el-1" hasToken />);
    expect((await screen.findByTestId("room-state")).textContent).toBe("Sin abrir");
    fireEvent.change(screen.getByLabelText("Tope de personas"), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("room-open"));
    expect((await screen.findByTestId("room-code")).textContent).toBe("ABC234");
    expect(screen.getByTestId("room-join-url").textContent).toBe("http://sala.test/j/ABC234");
    expect(screen.getByTestId("room-open").textContent).toContain("Ampliar");
    const post = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ maxSeats: 40, expiresInMin: 15 });
    expect((post?.init?.headers as Record<string, string>).Authorization).toBe("Bearer org-tok-xyz");
  });
});

describe("QR de la sala", () => {
  it("QR determinista y no vacío", () => {
    const a = qrPath("http://localhost:3000/j/ABC234");
    expect(a.size).toBeGreaterThanOrEqual(21);
    expect(a.d.length).toBeGreaterThan(100);
    expect(qrPath("http://localhost:3000/j/ABC234")).toEqual(a);
  });
});

describe("votedAt", () => {
  it("formatDate muestra sólo la fecha, sin hora", () => {
    const s = formatDate("2026-10-24T21:37:00.000Z");
    expect(s).toMatch(/2026/);
    expect(s).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
