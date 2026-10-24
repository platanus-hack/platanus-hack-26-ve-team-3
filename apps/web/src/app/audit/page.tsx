import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditVerifier } from "@/components/audit/AuditVerifier";
import { LoadingState } from "@/components/states";

export const metadata: Metadata = { title: "Auditor independiente" };

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="q-container py-10">
          <LoadingState label="Cargando auditor…" />
        </div>
      }
    >
      <AuditVerifier />
    </Suspense>
  );
}
