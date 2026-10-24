/**
 * Endurecimiento del esquema (hallazgos del laboratorio del jurado):
 *  (a) manifest_hash se calcula sobre el manifiesto TAL COMO LLEGA (canónico); un paquete honesto del motor con
 *      drawRule (candidates con amount, tieBreak) + anchorPolicy + rollPolicy da verificado;
 *  (b) un campo extra no declarado en una entrada del ledger, en el manifiesto o en la raíz → fallo detectado
 *      (`package_schema`), salvo los opcionales documentados (versions, generatedAt, draw, rollPolicy);
 *  (c) un JSON sin forma de paquete → "no evaluado" (no verificable), nunca "fallo detectado".
 */
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPackage } from "../src/index";
// Solo en tests: el adaptador fabrica un paquete real del motor (pruebas Groth16 de verdad).
import { buildAuditPackage, buildDemoElection, hashCanonical, runDraw, type AuditPackage, type DrawRule, type ElectionManifest } from "@quorum/protocol-adapter";

type Result = Awaited<ReturnType<typeof verifyPackage>>;
const check = (r: Result, name: string) => r.checks.find((c) => c.name === name);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const rule: DrawRule = {
  candidates: [
    { id: "p-huerto", label: "Huerto comunitario (ficticio)", amount: 600 },
    { id: "p-luces", label: "Iluminación del estacionamiento (ficticio)", amount: 1200 },
    { id: "p-pintura", label: "Pintura de áreas comunes (ficticio)" },
  ],
  winnersCount: { kind: "from-result", optionValues: [1, 2, 3] },
  tieBreak: "lowest",
};

let honest: AuditPackage & { rollPolicy?: unknown };
beforeAll(async () => {
  const demo = await buildDemoElection({ votes: [1, 1, 0], electionId: "test-strict-schema" });
  const manifest: ElectionManifest = {
    ...demo.manifest,
    drawRule: rule,
    anchorPolicy: { kind: "quorum-registry", chainId: 84532, registryAddress: "0x00000000000000000000000000000000000000Aa", organizer: "0x00000000000000000000000000000000000000bB" },
  };
  const t = demo.pkg.tally;
  const pkg = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: t, draw: runDraw(rule, t, demo.pkg.finalHash) });
  // Igual que el motor con sala abierta (engine.ts → withRollPolicy): opcional documentado, fuera de los hashes.
  honest = { ...pkg, rollPolicy: { kind: "open-room", maxSeats: 60, joined: 3, enrolled: 3, eligibility: "face-dedupe-demo", note: "sala abierta (simulación)" } };
}, 60_000);

describe("(a) paquete honesto del motor con drawRule/anchorPolicy/tieBreak/candidates", () => {
  it("da verificado (sin RPC el ancla no existe: no evaluado, nunca fallo) y manifest_hash cubre todos los campos", async () => {
    const r = await verifyPackage(honest);
    expect(r.checks.filter((c) => !c.passed)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(check(r, "package_schema")?.status).toBe("verificado");
    expect(check(r, "manifest_hash")?.status).toBe("verificado");
    expect(check(r, "draw_matches")?.status).toBe("verificado");
    expect(r.unsupportedGuarantees.join(" ")).toMatch(/censo-abierto-en-sala/);
  });

  it("manifest_hash se calcula sobre el manifiesto tal como llega: cambiar el monto de un candidato lo rompe", async () => {
    const t = clone(honest);
    t.manifest.drawRule!.candidates[0].amount = 999_999;
    const r = await verifyPackage(t);
    expect(check(r, "manifest_hash")?.status).toBe("fallo detectado");
    expect(r.valid).toBe(false);
  });

  it("un manifiesto con un campo extra NO pasa aunque el atacante rehaga manifestHash y checksums sobre él", async () => {
    const t = clone(honest) as AuditPackage & { manifest: Record<string, unknown> };
    t.manifest.secretNote = "fuera del esquema";
    t.manifestHash = hashCanonical(t.manifest);
    t.checksums.manifest = t.manifestHash;
    const r = await verifyPackage(t);
    expect(check(r, "package_schema")?.status).toBe("fallo detectado");
    expect(check(r, "package_schema")?.reason).toMatch(/manifest.*secretNote/);
    expect(r.valid).toBe(false);
  });
});

describe("(b) campos no declarados → package_schema: fallo detectado", () => {
  const cases: [string, (p: Record<string, unknown> & AuditPackage) => void, RegExp][] = [
    ["raíz del paquete", (p) => { p.extraRoot = 1; }, /raíz.*extraRoot/],
    ["manifiesto", (p) => { (p.manifest as unknown as Record<string, unknown>).hidden = true; }, /manifest.*hidden/],
    ["entrada del ledger", (p) => { (p.ledger[0] as unknown as Record<string, unknown>).voterId = "v_1"; }, /ledger\.0.*voterId/],
    ["prueba de una boleta", (p) => { (p.ledger[0].proof as unknown as Record<string, unknown>).choiceLabel = "Sí"; }, /ledger\.0\.proof.*choiceLabel/],
    ["candidato del sorteo", (p) => { (p.manifest.drawRule!.candidates[0] as unknown as Record<string, unknown>).owner = "x"; }, /candidates\.0.*owner/],
    ["tally", (p) => { (p.tally as unknown as Record<string, unknown>).bonus = 1; }, /tally.*bonus/],
    ["sorteo", (p) => { (p.draw as unknown as Record<string, unknown>).override = ["p-huerto"]; }, /draw.*override/],
  ];
  for (const [where, mutate, reason] of cases) {
    it(`campo extra en ${where}`, async () => {
      const t = clone(honest) as Record<string, unknown> & AuditPackage;
      mutate(t);
      const r = await verifyPackage(t);
      const c = check(r, "package_schema");
      expect(c?.status).toBe("fallo detectado");
      expect(c?.passed).toBe(false);
      expect(c?.reason).toMatch(reason);
      expect(r.valid).toBe(false);
    });
  }

  it("los opcionales documentados (versions, generatedAt, draw, rollPolicy) se aceptan y pueden faltar", async () => {
    const t = clone(honest) as Partial<typeof honest>;
    delete t.versions;
    delete t.generatedAt;
    delete t.rollPolicy;
    const r = await verifyPackage(t);
    expect(check(r, "package_schema")?.status).toBe("verificado");
    expect(r.valid).toBe(true);
  });
});

describe("(c) un JSON sin forma de paquete → no verificable, no fallo detectado", () => {
  const notPackages: [string, unknown][] = [
    ["objeto cualquiera", { hola: "mundo" }],
    ["array", [1, 2, 3]],
    ["null", null],
    ["número", 42],
    ["otro protocolo", { version: "quorum-audit/1", protocol: "helios" }],
    ["otra versión", { version: "otra/9", protocol: "semaphore-ledger" }],
  ];
  for (const [name, input] of notPackages) {
    it(name, async () => {
      const r = await verifyPackage(input);
      const c = check(r, "package_schema");
      expect(c?.status).toBe("no evaluado");
      expect(r.valid).toBe(false);
      expect(r.checks.some((x) => x.status === "fallo detectado")).toBe(false);
    });
  }

  it("pero un paquete quorum-audit/1 al que le falta un campo obligatorio SÍ es fallo detectado", async () => {
    const t = clone(honest) as Partial<AuditPackage>;
    delete t.finalHash;
    const r = await verifyPackage(t);
    expect(check(r, "package_schema")?.status).toBe("fallo detectado");
  });
});
