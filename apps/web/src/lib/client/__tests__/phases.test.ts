import { describe, expect, it } from "vitest";
import { hasAuditPackage, hasDraw, isAtLeast, nextOrganizerAction, PHASE_GRID_COLS, phaseIndex, phaseLine, PHASE_LINE } from "../phases";

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

  describe("paso «Sorteo» solo con candidatos (D-12)", () => {
    const ids = (line: { id: string }[]) => line.map((p) => p.id);
    it("sin candidatos (vacío, ausente o sin argumento) no existe el paso «Sorteo»: 5 pasos", () => {
      expect(ids(phaseLine())).toEqual(["registration", "open", "closed", "tallying", "auditable"]);
      expect(ids(phaseLine({ election: { candidates: [] } }))).toEqual(ids(phaseLine()));
      expect(ids(phaseLine({ election: {} }))).toEqual(ids(phaseLine()));
      expect(ids(phaseLine({ hasDraw: false }))).toEqual(ids(phaseLine()));
      expect(phaseLine().some((p) => p.label === "Sorteo")).toBe(false);
      expect(hasDraw({ candidates: [] })).toBe(false);
      expect(hasDraw(null)).toBe(false);
    });
    it("con candidatos se mantiene: 6 pasos y «Sorteo» al final", () => {
      const withDraw = phaseLine({ election: { candidates: [{ id: "p1" }] } });
      expect(ids(withDraw)).toEqual(ids(PHASE_LINE));
      expect(withDraw[withDraw.length - 1]).toEqual({ id: "drawn", label: "Sorteo", hint: "Cualquiera puede repetirlo" });
      expect(ids(phaseLine({ hasDraw: true }))).toEqual(ids(PHASE_LINE));
      expect(hasDraw({ candidates: [{ id: "p1" }] })).toBe(true);
    });
    it("modo continuo (D-22): sin inscripción aparte, con o sin sorteo", () => {
      expect(ids(phaseLine({ continuous: true }))).toEqual(["open", "closed", "tallying", "auditable"]);
      expect(phaseLine({ continuous: true })[0]!.label).toBe("Inscripción y votación");
      expect(ids(phaseLine({ election: { candidates: [{ id: "p1" }], votingMode: "continuous" } }))).toEqual(["open", "closed", "tallying", "auditable", "drawn"]);
    });
    it("«Resultado publicado · 4 de 5» pasa a «4 de 4» sin candidatos (línea continua); con inscripción, de «5 de 6» a «5 de 5»", () => {
      const pos = (line: ReturnType<typeof phaseLine>) => `${phaseIndex("auditable", line) + 1} de ${line.length}`;
      expect(pos(phaseLine({ continuous: true, hasDraw: true }))).toBe("4 de 5");
      expect(pos(phaseLine({ continuous: true }))).toBe("4 de 4");
      const noDraw = phaseLine();
      const withDraw = phaseLine({ hasDraw: true });
      expect(pos(withDraw)).toBe("5 de 6");
      expect(pos(noDraw)).toBe("5 de 5");
      // `drawn` en una línea sin sorteo se queda en «Resultado»; `failed` también; `registration` en continuo queda antes de la línea.
      expect(phaseIndex("drawn", noDraw)).toBe(phaseIndex("auditable", noDraw));
      expect(phaseIndex("failed", noDraw)).toBe(phaseIndex("auditable", noDraw));
      expect(phaseIndex("registration", phaseLine({ continuous: true }))).toBe(-1);
      expect(phaseIndex("draft", noDraw)).toBe(-1);
      expect(PHASE_GRID_COLS[noDraw.length]).toBe("md:grid-cols-5");
      expect(PHASE_GRID_COLS[withDraw.length]).toBe("md:grid-cols-6");
    });
  });
});
