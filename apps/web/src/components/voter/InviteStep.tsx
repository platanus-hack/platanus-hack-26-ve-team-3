"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import { cn } from "@/lib/client/cn";
import { formatDateTime, kindLabel } from "@/lib/client/format";
import type { InviteResponse as InviteV1 } from "@quorum/contracts";

export type InviteMode = "register" | "vote" | "registered-waiting" | "already-voted" | "readonly";

const cta: Record<InviteMode, string | null> = {
  register: "Inscribirme",
  vote: "Ir a votar",
  "registered-waiting": null,
  "already-voted": null,
  readonly: null,
};

export function InviteStep({ invite, mode, onNext }: { invite: InviteV1; mode: InviteMode; onNext: () => void }) {
  const { election } = invite;
  const label = cta[mode];
  return (
    <Card>
      <CardHeader>
        <Badge tone="success" className="w-fit">
          Invitación de demostración
        </Badge>
        <CardTitle as="h1" className="text-title">
          {election.title}
        </CardTitle>
        <CardDescription>
          {kindLabel[election.kind] ?? election.kind} · {election.options.length} opciones · cierra {formatDateTime(election.endsAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PhaseTimeline phase={election.status} />
        {mode === "register" ? (
          <p className="text-body text-muted-foreground">
            La inscripción tiene tres partes: comprobamos que tu rostro no esté ya inscrito en esta votación (modo demo), tu wallet firma ese enlace y tu navegador crea una credencial para votar.
          </p>
        ) : null}
        {mode === "vote" ? <p className="text-body text-muted-foreground">El padrón está congelado. Vota desde el mismo navegador donde te inscribiste: allí está tu credencial.</p> : null}
        {mode === "registered-waiting" ? (
          <Alert tone="info" title="Ya estás inscrito">
            Tu credencial está guardada en este navegador. Cuando el organizador abra la votación, vuelve a este enlace para votar.
          </Alert>
        ) : null}
        {mode === "already-voted" ? (
          <Alert tone="info" title="Ya votaste desde este navegador">
            Una credencial vale una sola boleta. Puedes comprobar que tu boleta está en el registro.
          </Alert>
        ) : null}
        {mode === "readonly" ? (
          <Alert tone="warning" title="Esta fase no admite inscripción ni voto">
            {election.status === "open" ? "La inscripción ya cerró y en este navegador no hay una credencial para esta votación." : "Puedes seguir la votación desde el centro de transparencia."}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap">
        {label ? (
          <Button full size="lg" onClick={onNext}>
            {label}
          </Button>
        ) : (
          <Link href={`/e/${encodeURIComponent(election.id)}`} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
            Ir al centro de transparencia
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
