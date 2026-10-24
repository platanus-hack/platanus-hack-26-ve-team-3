"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/input";

export function IdentityStep({ initialName, onBack, onNext }: { initialName: string; onBack: () => void; onNext: (data: { displayName: string; consent: true }) => void }) {
  const [name, setName] = useState(initialName);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return setError("Escribe tu nombre (al menos 2 caracteres).");
    if (trimmed.length > 80) return setError("El nombre es demasiado largo (máximo 80).");
    if (!consent) return setError("Necesitamos tu consentimiento para la prueba de vida en modo demo.");
    onNext({ displayName: trimmed, consent: true });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-title">
            Tus datos
          </CardTitle>
          <CardDescription>Tu nombre no se publica ni se asocia a tu opción. Sirve sólo para esta sesión de demostración.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Nombre" htmlFor="displayName" hint="Puede ser un nombre de prueba." error={error && error.includes("nombre") ? error : null}>
            <Input id="displayName" name="displayName" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-describedby="displayName-hint" aria-invalid={Boolean(error && error.includes("nombre"))} maxLength={80} required />
          </Field>
          <div className="rounded-md border border-border bg-muted p-3">
            <p className="mb-2 text-small font-semibold">Prueba de vida — modo demo, no certificada</p>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-small text-muted-foreground">
              <li>Usaremos tu cámara en el navegador para comprobar que hay una persona presente.</li>
              <li>No guardamos tu imagen. Sólo se envía un descriptor numérico que no permite reconstruir tu rostro.</li>
              <li>No es una verificación de identidad civil ni un servicio certificado.</li>
            </ul>
            <Checkbox id="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} label={<span>Acepto la prueba de vida en modo demo. Entiendo que no se guarda mi imagen.</span>} />
            {error && error.includes("consentimiento") ? (
              <p role="alert" className="mt-2 text-small font-semibold text-danger-strong">
                Error: {error}
              </p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" onClick={onBack}>
            Atrás
          </Button>
          <Button type="submit" full className="md:flex-1">
            Continuar a la prueba de vida
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
