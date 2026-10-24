import { describe, expect, it } from "vitest";
import { betterSample, clockOffset, countdownText, spokenCountdown } from "../clock";
import { ApiClientError, voterMessage } from "../api";

describe("reloj del servidor para la cuenta regresiva", () => {
  it("offset = serverNow − punto medio del viaje; ignora respuestas sin serverNow", () => {
    expect(clockOffset("2026-10-24T15:00:10.000Z", Date.parse("2026-10-24T15:00:00.000Z"), Date.parse("2026-10-24T15:00:00.400Z"))).toEqual({ offset: 9_800, rtt: 400, at: Date.parse("2026-10-24T15:00:00.400Z") });
    expect(clockOffset(undefined, 0, 1)).toBeNull();
    expect(clockOffset("no-es-fecha", 0, 1)).toBeNull();
  });
  it("se queda con la medición de menor ida y vuelta, salvo que tenga más de 2 min", () => {
    const a = { offset: 100, rtt: 50, at: 1_000 };
    const b = { offset: 300, rtt: 900, at: 2_000 };
    expect(betterSample(a, b)).toBe(a);
    expect(betterSample(a, { ...b, at: 200_000 })).toEqual({ ...b, at: 200_000 });
    expect(betterSample(null, b)).toBe(b);
  });
  it("mm:ss y h:mm:ss, redondeando hacia arriba y sin negativos", () => {
    expect(countdownText(272_000)).toBe("04:32");
    expect(countdownText(271_001)).toBe("04:32");
    expect(countdownText(999)).toBe("00:01");
    expect(countdownText(-5_000)).toBe("00:00");
    expect(countdownText(3_872_000)).toBe("1:04:32");
    expect(spokenCountdown(272_000)).toBe("5 minutos");
    expect(spokenCountdown(30_000)).toBe("menos de un minuto");
    expect(spokenCountdown(3_900_000)).toBe("1 hora y 5 minutos");
  });
});

describe("errores del votante sin jerga", () => {
  it("reemplaza mensajes técnicos del servidor por uno simple según el código", () => {
    expect(voterMessage(new ApiClientError("Base Sepolia RPC no responde", "unavailable", 503))).toBe("El servicio no está disponible en este momento. Inténtalo en unos segundos.");
    expect(voterMessage(new ApiClientError("La prueba Semaphore no verifica", "bad_response", 200))).toBe("No pudimos completar la verificación en este teléfono. Inténtalo de nuevo.");
    expect(voterMessage(new ApiClientError("Ese commitment ya está en el padrón", "invalid_input", 409))).toBe("Algo no salió bien al verificar tus datos. Inténtalo de nuevo.");
    expect(voterMessage(new Error("UserOp revertida (0xabc)"))).toBe("No pudimos completar la verificación en este teléfono. Inténtalo de nuevo.");
    expect(voterMessage(new ApiClientError("La sala está llena (3 de 3)", "room_full", 409))).toBe("La sala está llena. La sala está llena (3 de 3)");
  });
});
