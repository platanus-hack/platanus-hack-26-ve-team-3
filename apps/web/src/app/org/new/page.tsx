import type { Metadata } from "next";
import { Suspense } from "react";
import { ElectionWizard } from "@/components/org/ElectionWizard";
import { LoadingState } from "@/components/states";

export const metadata: Metadata = { title: "Crear votación" };

export default function NewElectionPage() {
  // El wizard usa la hora actual para proponer fechas: se transmite (stream) en vez de prerenderizarse.
  return (
    <Suspense
      fallback={
        <div className="q-container py-10">
          <LoadingState label="Preparando el formulario…" />
        </div>
      }
    >
      <ElectionWizard />
    </Suspense>
  );
}
