import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateGate } from "@/components/org/CreateGate";
import { ElectionComposer } from "@/components/org/ElectionComposer";
import { LoadingState } from "@/components/states";

export const metadata: Metadata = { title: "Nueva votación" };

export default function NewElectionPage() {
  // El editor usa la hora actual para proponer el cierre: se transmite (stream) en vez de prerenderizarse.
  return (
    <Suspense
      fallback={
        <div className="q-container py-10">
          <LoadingState label="Preparando la boleta…" />
        </div>
      }
    >
      <CreateGate>
        <ElectionComposer />
      </CreateGate>
    </Suspense>
  );
}
