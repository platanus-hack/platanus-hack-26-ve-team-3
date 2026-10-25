"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditResult, ElectionStatus } from "@quorum/contracts";
import { apiV1 } from "./apiV1";
import { hasAuditPackage } from "./phases";

/**
 * Veredicto real del verificador (`GET /api/elections/:id/audit`) cuando la fase ya tiene paquete (`auditable`, `drawn`,
 * `failed`). Una petición por fase; `null` mientras no llega, si no existe o si falla: sin él nunca se dice «verificado».
 * Lo usan `/e/:id/live` (`LiveDashboard`) y el panel del organizador (`OrgPanel`) para la misma carta del ganador.
 */
export function useAuditResult(electionId: string, status: ElectionStatus | null | undefined): AuditResult | null {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const auditFor = useRef<string | null>(null);

  useEffect(() => {
    if (!status || !hasAuditPackage(status)) return;
    const key = `${electionId}:${status}`;
    if (auditFor.current === key) return;
    auditFor.current = key;
    apiV1.getAudit(electionId).then(
      (a) => {
        if (auditFor.current === key) setAudit(a.auditResult);
      },
      () => {
        if (auditFor.current === key) setAudit(null);
      },
    );
  }, [electionId, status]);

  return audit;
}
