// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_DETAILS, CONSENT_SHORT } from "@/components/voter/Consent";
import { VoterFlow } from "@/components/voter/VoterFlow";
import { memoryKeyStore, openIdentity, peekIdentity, savePendingFace, setDeviceKeyStore } from "@/lib/client/identityVault";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));

/**
 * Jerga que NO debe aparecer en el flujo del votante, ni visible ni plegada (pedido de producto: para la persona es
 * "un proceso de verificación para votar"). Los detalles técnicos viven solo en /e/[id], /audit y los docs.
 */
const FORBIDDEN = /\bwallet|smart wallet|\bfirma|EIP-?712|FaceBinding|Semaphore|credencial|nullifier|commitment|Kernel|eoa-demo|on-?chain|blockchain|Base Sepolia|ZeroDev|testnet/i;
/** Todo el texto del flujo (incluidos desplegables: ya no hay "Detalles técnicos" en el flujo del votante). */
function mainText(root: HTMLElement): string {
  return root.textContent ?? "";
}

const FBH = `0x${"5a".repeat(32)}`;
type Phase = "draft" | "registration" | "open" | "closed" | "auditable";
function invite(phase: Phase, voter: Partial<{ walletAddress: string | null; livenessPassedAt: string | null; votedAt: string | null }> = {}, clock: { votingStartsAt?: string | null; serverNow?: string } = {}) {
  return {
    election: { id: "e1", title: "Asamblea ficticia (fixture): ¿pintamos el pasillo?", kind: "yes-no", options: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }], status: phase, endsAt: "2026-10-24T22:00:00.000Z", votingStartsAt: clock.votingStartsAt ?? null },
    voter: { id: "v1", displayName: "Vecina Ana", walletAddress: null, livenessPassedAt: null, votedAt: null, ...voter },
    ...(clock.serverNow ? { serverNow: clock.serverNow } : {}),
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
    expect(await screen.findByText("Preparando este teléfono…")).toBeTruthy();
    expect(await screen.findByText("¡Listo! Ya estás inscrito.", undefined, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getByText(/Deja esta página abierta: la boleta aparecerá aquí sola/)).toBeTruthy();
    // Sin hora programada: lo dice, sin cuenta regresiva.
    expect(screen.getByTestId("voting-countdown").textContent).toContain("Esperando que el organizador abra la votación…");
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
    // Ni "Detalles técnicos" ni la etiqueta del modo de vinculación en el flujo del votante (viven en /e/[id]).
    expect(screen.queryByTestId("tech-details")).toBeNull();
    expect(screen.queryByTestId("link-mode")).toBeNull();
    expect(container.textContent).not.toContain(idBody.commitment);
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

describe("VoterFlow · espera con cuenta regresiva", () => {
  async function registeredHere() {
    const { sealIdentity, markRegistered } = await import("@/lib/client/identityVault");
    await sealIdentity("e1", { voterId: "v1", faceBindingHash: FBH as `0x${string}`, address: "0x0000000000000000000000000000000000000001", walletMode: "eoa-demo" }, { privateKey: "1", commitment: "1" });
    markRegistered("e1", "1");
  }
  const registered = { walletAddress: "0x0000000000000000000000000000000000000001", livenessPassedAt: "2026-10-24T14:00:00.000Z" };

  it("'La votación empieza en 04:32' con el reloj del SERVIDOR aunque el teléfono vaya 1 h atrasado", async () => {
    await registeredHere();
    const serverNow = Date.now() + 3_600_000; // el teléfono va una hora atrasado
    mockFetch(() => ({ status: 200, body: invite("registration", registered, { serverNow: new Date(serverNow).toISOString(), votingStartsAt: new Date(serverNow + 272_500).toISOString() }) }));
    const { container } = render(<VoterFlow token="tok" />);
    expect(await screen.findByText("¡Listo! Ya estás inscrito.")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("countdown-value").textContent).toMatch(/^04:3[23]$/));
    expect(screen.getByTestId("voting-countdown").textContent).toContain("La votación empieza en");
    expect(screen.getByTestId("voting-countdown").dataset.state).toBe("counting");
    expect(mainText(container)).not.toMatch(FORBIDDEN);
  });

  it("más de una hora: h:mm:ss", async () => {
    await registeredHere();
    const serverNow = Date.now();
    mockFetch(() => ({ status: 200, body: invite("registration", registered, { serverNow: new Date(serverNow).toISOString(), votingStartsAt: new Date(serverNow + 3_600_000 + 4 * 60_000 + 32_500).toISOString() }) }));
    render(<VoterFlow token="tok" />);
    await waitFor(() => expect(screen.getByTestId("countdown-value").textContent).toMatch(/^1:04:3[23]$/));
  });

  it("al llegar a 0: 'Abriendo la votación…' y la boleta aparece sola cuando el servidor dice open", async () => {
    await registeredHere();
    let phase: Phase = "registration";
    const serverNow = Date.now();
    const startsAt = new Date(serverNow + 1_200).toISOString();
    mockFetch(() => ({ status: 200, body: invite(phase, registered, { serverNow: new Date().toISOString(), votingStartsAt: startsAt }) }));
    render(<VoterFlow token="tok" />);
    expect(await screen.findByText("¡Listo! Ya estás inscrito.")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("voting-countdown").dataset.state).toBe("opening"), { timeout: 4_000 });
    expect(screen.getByTestId("waiting-status").textContent).toContain("Abriendo la votación…");
    phase = "open";
    // Consulta inmediata al llegar a 0 + sondeo cada 2 s en la ventana final.
    expect(await screen.findByRole("radio", { name: "Sí" }, { timeout: 6_000 })).toBeTruthy();
  }, 15_000);
});

describe("VoterFlow · revisión manual (D-21)", () => {
  /** La pantalla nombra la credencial FÍSICA del evento (texto pedido por producto); el resto de la jerga sigue prohibida. */
  const FORBIDDEN_BUT_BADGE = new RegExp(FORBIDDEN.source.replace("credencial|", ""), "i");

  it("en revisión: pantalla simple, consulta hasta 'aprobado' y sigue sola a la vinculación → ¡Listo!", async () => {
    let decision: "pending_review" | "approved" = "pending_review";
    let linked = false;
    const calls = mockFetch((url) => {
      if (url.endsWith("/api/face/review")) return { status: 200, body: decision === "approved" ? { status: "approved", faceBindingHash: FBH } : { status: "pending_review" } };
      if (url.endsWith("/wallet")) {
        linked = true;
        return { status: 200, body: { id: "v1" } };
      }
      if (url.endsWith("/identity")) return { status: 201, body: { ok: true, registeredCount: 2 } };
      return { status: 200, body: { ...invite("registration", linked ? { livenessPassedAt: "2026-10-24T14:00:00.000Z" } : {}), voter: { ...invite("registration").voter, review: linked ? null : "pending" } } };
    });
    const { container } = render(<VoterFlow token="tok" />);
    expect(await screen.findByText("Tu caso necesita una revisión rápida.")).toBeTruthy();
    expect(screen.getByText("Muéstrale tu credencial al organizador.")).toBeTruthy();
    expect(mainText(container)).not.toMatch(FORBIDDEN_BUT_BADGE);
    expect(mainText(container)).not.toMatch(/coincid|similitud|gemel|duplicad/i);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/face/review"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/api/face/review"))!.body).toEqual({ voterId: "v1", inviteToken: "tok" });
    decision = "approved";
    expect(await screen.findByText("¡Listo! Ya estás inscrito.", undefined, { timeout: 20_000 })).toBeTruthy();
    const linkBody = calls.find((c) => c.url.endsWith("/wallet"))!.body as { bindingSignature: string };
    expect(linkBody.bindingSignature).toMatch(/^0x[0-9a-f]{130}$/);
    // Diagnóstico de la vinculación: etapas en orden, sin token, voterId ni dirección.
    const logs = calls.filter((c) => c.url.endsWith("/api/client-log")).map((c) => c.body as Record<string, unknown>);
    expect(logs.map((l) => l.stage).filter((st) => String(st).startsWith("link:"))).toEqual(["link:start", "link:wallet", "link:binding", "link:identity", "link:done"]);
    expect(JSON.stringify(logs)).not.toMatch(/tok|v1|0x[0-9a-f]{40}/);
  }, 30_000);

  it("rechazado: 'No pudimos verificar tu identidad. Habla con el organizador.'", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/face/review")) return { status: 200, body: { status: "rejected" } };
      return { status: 200, body: { ...invite("registration"), voter: { ...invite("registration").voter, review: "pending" } } };
    });
    const { container } = render(<VoterFlow token="tok" />);
    expect(await screen.findByRole("heading", { name: "No pudimos verificar tu identidad" }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(/Habla con el organizador/)).toBeTruthy();
    expect(mainText(container)).not.toMatch(FORBIDDEN);
  });
});
