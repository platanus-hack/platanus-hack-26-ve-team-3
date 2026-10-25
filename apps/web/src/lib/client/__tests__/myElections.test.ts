import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetElections, myElections, rememberVoterLink } from "../myElections";
import { rememberElection, recentElections } from "../orgStore";

/** localStorage mínimo para el entorno node (misma API que usa el código). */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("forgetElections: quitar votaciones de «Mis votaciones» (solo este teléfono)", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("borra el enlace del votante, la entrada de sala y la reciente del organizador; deja lo demás", () => {
    rememberVoterLink("el_a", "/v/tok-a", "Votación A");
    rememberVoterLink("el_b", "/v/tok-b", "Votación B");
    localStorage.setItem("quorum.room.K7M3QP", JSON.stringify({ electionId: "el_a", invitePath: "/v/tok-a", title: "Votación A" }));
    localStorage.setItem("quorum.credential.el_a", "credencial-que-no-se-toca");
    rememberElection("el_org1", "Organizo 1");
    rememberElection("el_org2", "Organizo 2");

    forgetElections([
      { electionId: "el_a", role: "voter" },
      { electionId: "el_org1", role: "organizer" },
    ]);

    expect(localStorage.getItem("quorum.mine.el_a")).toBeNull();
    expect(localStorage.getItem("quorum.room.K7M3QP")).toBeNull();
    expect(localStorage.getItem("quorum.mine.el_b")).not.toBeNull();
    expect(localStorage.getItem("quorum.credential.el_a")).toBe("credencial-que-no-se-toca");
    expect(recentElections().map((e) => e.id)).toEqual(["el_org2"]);
    expect(myElections().map((e) => `${e.role}:${e.electionId}`)).toEqual(["voter:el_b", "organizer:el_org2"]);
  });

  it("no rompe con entradas corruptas ni sin localStorage", () => {
    localStorage.setItem("quorum.mine.raro", "{no es json");
    rememberVoterLink("el_c", "/v/tok-c", "C");
    expect(() => forgetElections([{ electionId: "el_c", role: "voter" }])).not.toThrow();
    expect(localStorage.getItem("quorum.mine.el_c")).toBeNull();
    expect(localStorage.getItem("quorum.mine.raro")).toBe("{no es json");

    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => forgetElections([{ electionId: "x", role: "voter" }, { electionId: "y", role: "organizer" }])).not.toThrow();
  });
});
