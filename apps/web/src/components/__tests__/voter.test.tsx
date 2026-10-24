// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_DETAILS, CONSENT_SHORT } from "@/components/voter/Consent";
import { VoterFlow } from "@/components/voter/VoterFlow";
import { memoryKeyStore, openIdentity, peekIdentity, savePendingFace, setDeviceKeyStore } from "@/lib/client/identityVault";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));

/** Palabras técnicas que NO deben aparecer en el flujo principal del votante (sí dentro de "Detalles técnicos"). */
const FORBIDDEN = /\bwallet|\bfirma|EIP-712|Semaphore|credencial|nullifier|commitment|Kernel|on-chain/i;
/** Texto visible del flujo principal: sin el desplegable "Detalles técnicos". */
function mainText(root: HTMLElement): string {
  const c = root.cloneNode(true) as HTMLElement;
  c.querySelectorAll('[data-testid="tech-details"]').forEach((d) => d.remove());
  return c.textContent ?? "";
}

const FBH = `0x${"5a".repeat(32)}`;
type Phase = "draft" | "registration" | "open" | "closed" | "auditable";
function invite(phase: Phase, voter: Partial<{ walletAddress: string | null; livenessPassedAt: string | null; votedAt: string | null }> = {}) {
  return {
    election: { id: "e1", title: "Asamblea ficticia (fixture): ¿pintamos el pasillo?", kind: "yes-no", options: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }], status: phase, endsAt: "2026-10-24T22:00:00.000Z" },
    voter: { id: "v1", displayName: "Vecina Ana", walletAddress: null, livenessPassedAt: null, votedAt: null, ...voter },
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const { status, body } = handler(url, init);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  setDeviceKeyStore(memoryKeyStore());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VoterFlow · inscripción", () => {
  it("paso 1 de 2: una sola pantalla con título, consentimiento corto + 'Más detalles' y un solo botón Continuar; sin jerga técnica", async () => {
    mockFetch(() => ({ status: 200, body: invite("registration") }));
    const { container } = render(<VoterFlow token="tok" />);
    expect(await screen.findByRole("heading", { level: 1, name: /pintamos el pasillo/ })).toBeTruthy();
    expect(screen.getByTestId("step-indicator").textContent).toContain("Paso 1 de 2");
    expect(screen.getByTestId("voter-consent").textContent).toContain(CONSENT_SHORT);
    expect(screen.getByText("Más detalles")).toBeTruthy();
    const details = screen.getByTestId("consent-details").textContent ?? "";
    expect(details).toContain("descriptor facial");
    expect(details).toContain("se borra al abrir la votación");
    expect(details).toContain("no revela cuál inscrito emitió cada boleta");
    expect(details).toContain("El servidor sí ve el contenido");
    for (const p of [CONSENT_SHORT, ...CONSENT_DETAILS]) expect(p).not.toMatch(/anónim|secreto|100 ?%/i);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(mainText(container)).not.toMatch(FORBIDDEN);
  });

  it("rostro ya comprobado: vincula el teléfono en segundo plano (wallet + FaceBinding + identidad) y queda esperando", async () => {
    savePendingFace("v1", FBH as `0x${string}`);
    let wallet: string | null = null;
    const calls = mockFetch((url) => {
      if (url.endsWith("/wallet")) return { status: 200, body: { id: "v1" } };
      if (url.endsWith("/identity")) return { status: 201, body: { ok: true, registeredCount: 3 } };
      return { status: 200, body: invite("registration", { livenessPassedAt: "2026-10-24T14:00:00.000Z", walletAddress: wallet }) };
    });
    const { container } = render(<VoterFlow token="tok" />);
    expect(await screen.findByText("Vinculando este teléfono…")).toBeTruthy();
    expect(await screen.findByText("¡Listo! Ya estás inscrito.", undefined, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getByText(/Deja esta página abierta: la votación aparecerá aquí cuando empiece/)).toBeTruthy();
    const linkBody = calls.find((c) => c.url.endsWith("/wallet"))!.body as { kind: string; bindingSignature: string; walletAddress: string };
    wallet = linkBody.walletAddress;
    expect(linkBody.kind).toBe("eoa-demo");
    expect(linkBody.bindingSignature).toMatch(/^0x[0-9a-f]{130}$/);
    const idBody = calls.find((c) => c.url.endsWith("/identity"))!.body as { commitment: string };
    expect(idBody.commitment).toMatch(/^\d+$/);
    expect(Object.keys(idBody).sort()).toEqual(["commitment", "inviteToken"]);
    // La clave privada nunca viaja y la bóveda se abre sin wallet.
    expect(JSON.stringify(calls)).not.toMatch(/privateKey/);
    expect(peekIdentity("e1")?.commitment).toBe(idBody.commitment);
    await expect(openIdentity("e1")).resolves.toMatchObject({ commitment: idBody.commitment });
    expect(mainText(container)).not.toMatch(FORBIDDEN);
    // Lo técnico sí está, dentro de Detalles técnicos, con la etiqueta demo.
    expect(screen.getByTestId("tech-details").textContent).toMatch(/Wallet demo \(eoa-demo\)/);
    expect(screen.getByTestId("commitment").textContent).toBe(idBody.commitment);
  }, 30_000);

  it("si el rostro se comprobó en otro teléfono, no intenta otra vez: lo explica", async () => {
    mockFetch(() => ({ status: 200, body: invite("registration", { livenessPassedAt: "2026-10-24T14:00:00.000Z" }) }));
    render(<VoterFlow token="tok" />);
    expect(await screen.findByText("Ya empezaste en otro teléfono")).toBeTruthy();
  });
});

describe("VoterFlow · otras fases", () => {
  it("votación abierta sin inscripción en este teléfono → seguirla sin votar (observador)", async () => {
    mockFetch(() => ({ status: 200, body: invite("open") }));
    render(<VoterFlow token="tok" />);
    expect(await screen.findByText("La votación ya empezó")).toBeTruthy();
    expect(screen.getByTestId("observer-mode")).toBeTruthy();
  });

  it("votación cerrada → resultados", async () => {
    mockFetch(() => ({ status: 200, body: invite("auditable") }));
    render(<VoterFlow token="tok" />);
    expect(await screen.findByText("La votación terminó")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver resultados" }).getAttribute("href")).toBe("/e/e1/live");
  });

  it("ya votó (otro navegador, sólo votedAt) → 'Ya votaste' con la fecha, sin boleta", async () => {
    mockFetch(() => ({ status: 200, body: invite("open", { votedAt: "2026-10-24T04:00:00.000Z" }) }));
    const { container } = render(<VoterFlow token="tok" />);
    expect(await screen.findByText("Ya votaste")).toBeTruthy();
    expect(screen.getByTestId("voted-at").textContent).toMatch(/Votaste el/);
    expect(screen.queryByTestId("ballot")).toBeNull();
    expect(mainText(container)).not.toMatch(FORBIDDEN);
  });

  it("boleta: opciones como botones grandes; tocar una muestra un único 'Votar: <opción>'", async () => {
    const { sealIdentity } = await import("@/lib/client/identityVault");
    await sealIdentity("e1", { voterId: "v1", faceBindingHash: FBH as `0x${string}`, address: "0x0000000000000000000000000000000000000001", walletMode: "eoa-demo" }, { privateKey: "1", commitment: "1" });
    mockFetch(() => ({ status: 200, body: invite("open", { walletAddress: "0x0000000000000000000000000000000000000001" }) }));
    const { container } = render(<VoterFlow token="tok" />);
    const si = await screen.findByRole("radio", { name: "Sí" });
    expect(si.className).toMatch(/min-h-14/);
    expect(screen.queryByTestId("vote-button")).toBeNull();
    fireEvent.click(si);
    await waitFor(() => expect(screen.getByTestId("vote-button").textContent).toBe("Votar: Sí"));
    expect(si.getAttribute("aria-checked")).toBe("true");
    expect(mainText(container)).not.toMatch(FORBIDDEN);
  });
});
