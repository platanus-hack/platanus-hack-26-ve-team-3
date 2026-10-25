"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoomStatus } from "@quorum/contracts";
import { orgMessage } from "@/lib/client/api";
import { timed, useServerClock, type ClockSample } from "@/lib/client/clock";
import { roomApi } from "@/lib/client/room";

const POLL_MS = 3000;

export type RoomFeed = {
  status: RoomStatus | null;
  setStatus: (s: RoomStatus) => void;
  error: string | null;
  refresh: () => Promise<void>;
  /** Desfase servidor − teléfono (ms) para las cuentas regresivas. */
  offset: number;
  record: (s: ClockSample | null) => void;
};

/**
 * Estado de la sala (`GET /api/elections/:id/room`, con Bearer si hay token en esta pestaña) con sondeo cada 3 s y
 * reloj del servidor. Lo comparten la cabina del panel y «Más › Sala» para no duplicar peticiones.
 */
export function useRoomStatus(electionId: string, { enabled = true, hasToken = false }: { enabled?: boolean; hasToken?: boolean } = {}): RoomFeed {
  const { offset, record } = useServerClock();
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { value, sample } = await timed(() => roomApi.status(electionId));
      record(sample);
      setStatus(value);
      setError(null);
    } catch (e) {
      setError(orgMessage(e));
    }
  }, [electionId, record]);

  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, enabled, hasToken]);

  return { status, setStatus, error, refresh, offset, record };
}
