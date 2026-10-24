import { describe, expect, it } from "vitest";
import { hasAuditPackage, isAtLeast, nextOrganizerAction, phaseIndex, PHASE_LINE } from "../phases";

describe("fases v1", () => {
  it("sigue el orden registration → open → closed → tallying → auditable → drawn", () => {
    expect(PHASE_LINE.map((p) => p.id)).toEqual(["registration", "open", "closed", "tallying", "auditable", "drawn"]);
    expect(phaseIndex("draft")).toBe(-1);
    expect(phaseIndex("failed")).toBe(phaseIndex("auditable"));
    expect(isAtLeast("auditable", "closed")).toBe(true);
    expect(isAtLeast("failed", "closed")).toBe(false);
  });

  it("un solo botón por fase para el organizador", () => {
    expect(nextOrganizerAction("draft", { candidates: 0 })?.id).toBe("publish");
    expect(nextOrganizerAction("registration", { candidates: 0 })?.id).toBe("open");
    expect(nextOrganizerAction("open", { candidates: 0 })?.id).toBe("close");
    expect(nextOrganizerAction("auditable", { candidates: 3 })?.id).toBe("draw");
    expect(nextOrganizerAction("auditable", { candidates: 0 })).toBeNull();
    for (const p of ["closed", "tallying", "drawn", "failed"] as const) expect(nextOrganizerAction(p, { candidates: 3 })).toBeNull();
  });

  it("hay paquete que verificar en auditable, drawn y failed (se publica aunque falle)", () => {
    expect(["auditable", "drawn", "failed"].every((p) => hasAuditPackage(p as never))).toBe(true);
    expect(hasAuditPackage("open")).toBe(false);
  });
});
