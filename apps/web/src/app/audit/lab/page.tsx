import type { Metadata } from "next";
import { Suspense } from "react";
import { AttackLab } from "@/components/audit/AttackLab";
import { LoadingState } from "@/components/states";

export const metadata: Metadata = { title: "Laboratorio del jurado" };

export default function AuditLabPage() {
  return (
    <Suspense
      fallback={
        <div className="q-container py-10">
          <LoadingState label="Cargando laboratorio…" />
        </div>
      }
    >
      <AttackLab />
    </Suspense>
  );
}
