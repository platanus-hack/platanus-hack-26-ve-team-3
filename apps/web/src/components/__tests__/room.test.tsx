// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qrPath } from "@/components/room/QrCode";
import { CONSENT_POINTS, RoomJoin } from "@/components/room/RoomJoin";
import { RoomCard } from "@/components/room/RoomCard";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { saveOrgToken } from "@/lib/client/orgStore";
import { auditTriState, checkTriState, leadingOption, takeTokenFromHash } from "@/lib/client/projector";
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
  it("muestra título, X de N lugares y el consentimiento honesto", async () => {
    mockFetch(() => ({ status: 200, body: info() }));
    render(<RoomJoin roomCode="abc234" />);
    expect(await screen.findByText("Asamblea ficticia (fixture)")).toBeTruthy();
    expect(screen.getByTestId("room-seats").textContent).toContain("3 de 60 lugares");
    const consent = screen.getByTestId("room-consent").textContent ?? "";
    expect(consent).toContain("se borra al abrir la votación");
    expect(consent).toContain("no revela cuál inscrito emitió cada boleta");
    expect(consent).toContain("El servidor sí ve el contenido");
    for (const p of CONSENT_POINTS) expect(p).not.toMatch(/anónim|secreto|100 ?%/i);
  });

  it("valida alias y consentimiento antes de llamar al servidor", async () => {
    const calls = mockFetch(() => ({ status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Alias"), { target: { value: "04125551234" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar a la sala" }));
    expect(await screen.findByText(/No uses tu teléfono/)).toBeTruthy();
    expect(screen.getByText(/necesitamos tu consentimiento/)).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Alias"), { target: { value: " Ana " } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Entrar a la sala" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/v/tok-1");
  });

  it("sala llena → modo observador", async () => {
    mockFetch(() => ({ status: 200, body: info({ seatsTaken: 60 }) }));
    render(<RoomJoin roomCode="ABC234" />);
    expect(await screen.findByText("La sala está llena")).toBeTruthy();
    const obs = screen.getByTestId("observer-mode");
    expect(obs.querySelector('a[href="/e/el-1/live"]')).toBeTruthy();
    expect(obs.querySelector('a[href="/e/el-1/draw"]')).toBeTruthy();
    expect(screen.queryByLabelText("Alias")).toBeNull();
  });

  it("votación ya comenzó → observador; 410 al entrar muestra el texto del servidor", async () => {
    mockFetch(() => ({ status: 200, body: info({ open: false, closedReason: "election-opened" }) }));
    render(<RoomJoin roomCode="ABC234" />);
    expect(await screen.findByText("La votación ya comenzó")).toBeTruthy();
    cleanup();

    mockFetch((url) => (url.endsWith("/join") ? { status: 410, body: { error: "La sala expiró", code: "room_closed" } } : { status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Alias"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Entrar a la sala" }));
    expect(await screen.findByText(/La sala expiró\./)).toBeTruthy();
    expect(screen.getByTestId("observer-mode")).toBeTruthy();
  });

  it("429 → mensaje de espera, sigue el formulario", async () => {
    mockFetch((url) => (url.endsWith("/join") ? { status: 429, body: { error: "Demasiadas solicitudes", code: "forbidden" } } : { status: 200, body: info() }));
    render(<RoomJoin roomCode="ABC234" />);
    await screen.findByText("Asamblea ficticia (fixture)");
    fireEvent.change(screen.getByLabelText("Alias"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Entrar a la sala" }));
    expect(await screen.findByText("Espera un momento")).toBeTruthy();
    expect(screen.getByLabelText("Alias")).toBeTruthy();
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

describe("proyector: lógica pura", () => {
  it("check.status de tres estados, con respaldo en passed/reason", () => {
    expect(checkTriState({ name: "a", status: "pass" })).toBe("verificado");
    expect(checkTriState({ name: "a", status: "fail", passed: true })).toBe("fallo detectado");
    expect(checkTriState({ name: "a", status: "not-evaluated", passed: true })).toBe("no verificable");
    expect(checkTriState({ name: "a", passed: true, reason: "no evaluado: sin RPC" })).toBe("no verificable");
    expect(checkTriState({ name: "a", passed: false })).toBe("fallo detectado");
  });
  it("estado global: nunca 'verificado' sin valid del verificador ni con un fallo", () => {
    expect(auditTriState({ valid: true, checks: [{ name: "a", passed: true }], unsupportedGuarantees: [] })).toEqual({ overall: "verificado", partial: false });
    expect(auditTriState({ valid: true, checks: [{ name: "a", passed: true }, { name: "b", status: "not-evaluated" }], unsupportedGuarantees: [] })).toEqual({ overall: "verificado", partial: true });
    expect(auditTriState({ valid: true, checks: [], unsupportedGuarantees: [] }).overall).toBe("no verificable");
    expect(auditTriState({ valid: false, checks: [{ name: "a", passed: false }], unsupportedGuarantees: [] }).overall).toBe("fallo detectado");
  });
  it("opción líder sólo sin empate", () => {
    expect(leadingOption([{ id: "a", count: 3 }, { id: "b", count: 1 }])?.id).toBe("a");
    expect(leadingOption([{ id: "a", count: 2 }, { id: "b", count: 2 }])).toBeNull();
    expect(leadingOption([{ id: "a", count: null }])).toBeNull();
  });
  it("token del organizador por fragmento: se lee y se borra de la URL", () => {
    const replace = vi.fn();
    expect(takeTokenFromHash({ hash: "#t=abc%2B1", pathname: "/e/x/proyector", search: "" }, replace)).toBe("abc+1");
    expect(replace).toHaveBeenCalledWith("/e/x/proyector");
    expect(takeTokenFromHash({ hash: "", pathname: "/", search: "" }, replace)).toBeNull();
  });
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
