"use client";

/**
 * Hora del servidor en el cliente: el reloj del teléfono puede estar adelantado o atrasado minutos. Cada respuesta que
 * trae `serverNow` (GET invitación, elección, sala) da una medición: offset = serverNow − punto medio del viaje.
 * Las cuentas regresivas usan `Date.now() + offset`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ClockSample = { offset: number; rtt: number; at: number };

/** Offset (ms) servidor − teléfono con la petición enviada en `sentAt` y recibida en `receivedAt` (reloj local). */
export function clockOffset(serverNow: string | null | undefined, sentAt: number, receivedAt: number): ClockSample | null {
  if (!serverNow) return null;
  const s = Date.parse(serverNow);
  if (!Number.isFinite(s) || receivedAt < sentAt) return null;
  return { offset: s - (sentAt + receivedAt) / 2, rtt: receivedAt - sentAt, at: receivedAt };
}

/**
 * Elige la mejor medición: la de menor tiempo de ida y vuelta (más precisa), salvo que tenga más de 2 minutos
 * (el reloj del teléfono puede cambiar, p. ej. sincronización de red).
 */
export function betterSample(prev: ClockSample | null, next: ClockSample | null): ClockSample | null {
  if (!next) return prev;
  if (!prev) return next;
  if (next.at - prev.at > 120_000) return next;
  return next.rtt <= prev.rtt ? next : prev;
}

/** "04:32" (menos de 1 h) o "1:04:32"; nunca negativo. Redondea hacia arriba: "00:01" hasta el último instante. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Texto para lectores de pantalla, sin anunciar cada segundo: "4 minutos", "menos de un minuto". */
export function spokenCountdown(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (ms <= 60_000) return "menos de un minuto";
  if (min < 60) return `${min} minutos`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return `${h} ${h === 1 ? "hora" : "horas"}${rest ? ` y ${rest} minutos` : ""}`;
}

/** Hora del inicio ("3:45 p. m."), America/Caracas. */
export function formatStartTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Mide una petición: la ejecuta y devuelve el valor con la medición de reloj (si la respuesta trae `serverNow`). */
export async function timed<T extends { serverNow?: string | null }>(fn: () => Promise<T>): Promise<{ value: T; sample: ClockSample | null }> {
  const sentAt = Date.now();
  const value = await fn();
  return { value, sample: clockOffset(value.serverNow, sentAt, Date.now()) };
}

/** Offset del reloj del servidor que se va afinando con cada medición. */
export function useServerClock(): { offset: number; record: (s: ClockSample | null) => void } {
  const best = useRef<ClockSample | null>(null);
  const [offset, setOffset] = useState(0);
  const record = useCallback((s: ClockSample | null) => {
    const next = betterSample(best.current, s);
    if (next && next !== best.current) {
      best.current = next;
      setOffset(Math.round(next.offset));
    }
  }, []);
  return { offset, record };
}

/**
 * Milisegundos que faltan para `targetIso` según la hora del servidor (`Date.now() + offset`), refrescado cada
 * `tickMs`. `null` sin hora o hasta montar (evita desajustes de hidratación).
 */
export function useCountdown(targetIso: string | null | undefined, offset: number, tickMs = 250): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const target = targetIso ? Date.parse(targetIso) : NaN;
    if (!Number.isFinite(target)) {
      const t = window.setTimeout(() => setLeft(null), 0);
      return () => clearTimeout(t);
    }
    const tick = () => setLeft(target - (Date.now() + offset));
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, tickMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [targetIso, offset, tickMs]);
  return left;
}
