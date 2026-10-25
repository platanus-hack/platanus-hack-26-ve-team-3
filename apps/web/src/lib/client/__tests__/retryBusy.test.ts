import { describe, expect, it, vi } from "vitest";
import { ApiClientError, retryBusy } from "../api";

const busy = () => new ApiClientError("Demasiadas solicitudes; intenta en un minuto", "forbidden", 429);

describe("retryBusy: reintento sin mensaje ante 429", () => {
  it("reintenta tras 429 y devuelve el resultado", async () => {
    const fn = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValue("ok");
    await expect(retryBusy(fn, [0, 0, 0])).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("no reintenta otros errores (doble voto, rostro duplicado, red)", async () => {
    for (const err of [new ApiClientError("ya votaste", "already_voted", 409), new ApiClientError("fetch failed", "network", 0), new Error("x")]) {
      const fn = vi.fn().mockRejectedValue(err);
      await expect(retryBusy(fn, [0, 0])).rejects.toBe(err);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("se rinde después de agotar las esperas y deja ver el 429", async () => {
    const fn = vi.fn().mockRejectedValue(busy());
    await expect(retryBusy(fn, [0, 0])).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
