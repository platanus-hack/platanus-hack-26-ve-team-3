"use client";

import { useEffect, useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { LoadingState } from "@/components/states";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { clearCreateCode, loadCreateCode, saveCreateCode } from "@/lib/client/orgStore";

type State = { kind: "loading" } | { kind: "ask"; error: string | null; busy: boolean } | { kind: "open" };

/**
 * D-25: crear votaciones pide un código de acceso (lo fija el servidor con `QUORUM_CREATE_CODE`; si no está, no se pide).
 * El código vive solo en esta pestaña y viaja en la cabecera `x-quorum-create-code` al crear.
 */
export function CreateGate({ children }: { children: React.ReactNode }) {
  const inputId = useId();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { required } = await apiV1.createAccessRequired();
        if (cancelled) return;
        if (!required) return setState({ kind: "open" });
        const saved = loadCreateCode();
        if (saved) {
          try {
            await apiV1.createAccessCheck(saved);
            if (!cancelled) return setState({ kind: "open" });
          } catch {
            clearCreateCode();
          }
        }
        if (!cancelled) setState({ kind: "ask", error: null, busy: false });
      } catch {
        // Sin respuesta del servidor: se pide el código igual (cerrado por defecto).
        if (!cancelled) setState({ kind: "ask", error: null, busy: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setState({ kind: "ask", error: null, busy: true });
    try {
      await apiV1.createAccessCheck(c);
      saveCreateCode(c);
      setState({ kind: "open" });
    } catch (err) {
      const msg = err instanceof ApiClientError && err.code === "forbidden" ? "Ese código no es válido." : describeError(err);
      setState({ kind: "ask", error: msg, busy: false });
    }
  }

  if (state.kind === "open") return <>{children}</>;
  if (state.kind === "loading") {
    return (
      <div className="q-container py-10">
        <LoadingState label="Preparando…" />
      </div>
    );
  }
  return (
    <div className="q-container q-narrow flex flex-col gap-5 py-10" data-testid="create-gate">
      <header className="flex flex-col gap-1">
        <p className="q-eyebrow">Crear votación</p>
        <h1 className="text-title font-bold leading-tight">Código de acceso</h1>
        <p className="text-body text-muted-foreground">Solo el equipo organizador puede crear votaciones. Pide el código a quien administra Quórum.</p>
      </header>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Field label="Código" htmlFor={inputId}>
          <Input id={inputId} type="password" autoComplete="off" autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="min-h-14 text-heading" aria-invalid={Boolean(state.error)} />
        </Field>
        {state.error ? (
          <Alert tone="danger" title="No se pudo entrar">
            {state.error}
          </Alert>
        ) : null}
        <Button type="submit" size="lg" full className="min-h-14" loading={state.busy} disabled={!code.trim()}>
          <KeyRound aria-hidden="true" /> Entrar
        </Button>
      </form>
    </div>
  );
}
