// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { CreateGate } from "@/components/org/CreateGate";

vi.mock("@/lib/client/apiV1", () => ({
  apiV1: {
    createAccessRequired: vi.fn(async () => ({ required: true })),
    createAccessCheck: vi.fn(async () => ({ ok: true as const })),
  },
}));

/** D-25: puerta de código de acceso para crear votaciones. */
describe("CreateGate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(apiV1.createAccessRequired).mockResolvedValue({ required: true });
    vi.mocked(apiV1.createAccessCheck).mockResolvedValue({ ok: true });
  });
  afterEach(cleanup);

  it("sin código configurado en el servidor: pasa directo al editor", async () => {
    vi.mocked(apiV1.createAccessRequired).mockResolvedValue({ required: false });
    render(
      <CreateGate>
        <p>EDITOR</p>
      </CreateGate>,
    );
    expect(await screen.findByText("EDITOR")).toBeTruthy();
    expect(screen.queryByTestId("create-gate")).toBeNull();
  });

  it("con código: pide el código; uno incorrecto avisa; el correcto abre el editor y queda en la pestaña", async () => {
    vi.mocked(apiV1.createAccessCheck).mockRejectedValueOnce(new ApiClientError("Código de acceso incorrecto", "forbidden", 403));
    render(
      <CreateGate>
        <p>EDITOR</p>
      </CreateGate>,
    );
    const gate = await screen.findByTestId("create-gate");
    expect(gate.textContent).toContain("Código de acceso");
    expect(screen.queryByText("EDITOR")).toBeNull();
    const input = screen.getByLabelText("Código") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "mal" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(await screen.findByText("Ese código no es válido.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "platanus-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(await screen.findByText("EDITOR")).toBeTruthy();
    expect(sessionStorage.getItem("quorum.createCode")).toBe("platanus-2026");
  });

  it("si el código guardado ya no vale, lo olvida y vuelve a pedirlo", async () => {
    sessionStorage.setItem("quorum.createCode", "viejo");
    vi.mocked(apiV1.createAccessCheck).mockRejectedValueOnce(new ApiClientError("no", "forbidden", 403));
    render(
      <CreateGate>
        <p>EDITOR</p>
      </CreateGate>,
    );
    expect(await screen.findByTestId("create-gate")).toBeTruthy();
    await waitFor(() => expect(sessionStorage.getItem("quorum.createCode")).toBeNull());
  });
});
