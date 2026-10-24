"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import type { InviteResponse } from "@/lib/client/api";
import { formatDateTime, kindLabel, statusLabel } from "@/lib/client/format";

export function InviteStep({ invite, onNext }: { invite: InviteResponse; onNext: () => void }) {
  const { election, voter } = invite;
  const open = election.status === "open";
  const alreadyVoted = Boolean(voter.votedAt);
  return (
    <Card>
      <CardHeader>
        <Badge tone="success" className="w-fit">
          Invitado de demostración — voto privado
        </Badge>
        <CardTitle as="h1" className="text-title">
          {election.title}
        </CardTitle>
        <CardDescription>
          {kindLabel[election.kind] ?? election.kind} · {election.options.length} opciones · cierra {formatDateTime(election.endsAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-small">
          <div>
            <dt className="text-muted-foreground">Estado</dt>
            <dd className="font-semibold">{statusLabel[election.status] ?? election.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tu invitación</dt>
            <dd className="font-semibold">{alreadyVoted ? "Ya usada" : "Disponible"}</dd>
          </div>
        </dl>
        <p className="text-body text-muted-foreground">
          Esta es una elección de demostración. Nadie verá tu opción: la boleta se firma con una wallet creada para ti y sólo se publica un comprobante de inclusión.
        </p>
        {!open ? (
          <Alert tone="warning" title="La elección no está abierta">
            Estado actual: {statusLabel[election.status] ?? election.status}. Puedes revisar el centro de transparencia, pero no se aceptan votos.
          </Alert>
        ) : null}
        {alreadyVoted ? (
          <Alert tone="info" title="Esta invitación ya votó">
            Registrado el {formatDateTime(voter.votedAt)}. Cada invitación vale un solo voto.
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button full size="lg" onClick={onNext} disabled={!open || alreadyVoted}>
          Comenzar
        </Button>
      </CardFooter>
    </Card>
  );
}
