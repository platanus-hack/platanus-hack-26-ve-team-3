import { describe, expect, it } from "vitest";
import { casesLabel, openWarnings, readinessLine } from "../reviews";

describe("avisos antes de abrir la votación (D-21)", () => {
  it("X de Y listos y casos por revisar", () => {
    expect(readinessLine({ ready: 2, total: 3, pending: 0 })).toBe("2 de 3 listos");
    expect(casesLabel(1)).toBe("Hay 1 caso por revisar");
    expect(casesLabel(2)).toBe("Hay 2 casos por revisar");
  });
  it("advierte pendientes y personas a medio inscribir; nada si todos terminaron", () => {
    expect(openWarnings({ ready: 3, total: 3, pending: 0 })).toEqual([]);
    expect(openWarnings({ ready: 2, total: 3, pending: 0 })).toEqual(["2 de 3 personas terminaron. La otra no podrá votar. ¿Abrir igual?"]);
    expect(openWarnings({ ready: 1, total: 3, pending: 1 })).toEqual([
      "Hay 1 caso por revisar. Si abres ahora, se rechaza automáticamente.",
      "1 de 3 personas terminaron. Las demás no podrán votar. ¿Abrir igual?",
    ]);
  });
});
