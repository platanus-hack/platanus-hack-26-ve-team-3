import { describe, expect, it } from "vitest";
import type { InviteResponse } from "@quorum/contracts";
import { ownsInvite, type Local } from "../voterAccess";

const invite = (status: InviteResponse["election"]["status"], voter: Partial<InviteResponse["voter"]> = {}): InviteResponse =>
  ({
    election: { id: "el-1", title: "Asamblea", kind: "yes-no", options: [], status, endsAt: new Date().toISOString(), votingStartsAt: null },
    voter: { id: "vt-1", displayName: "Ana", walletAddress: null, livenessPassedAt: null, votedAt: null, ...voter },
  }) as InviteResponse;

const none: Local = { identity: null, registered: false, receipt: null, pendingFace: null };
const withIdentity: Local = { ...none, identity: { voterId: "vt-1" } as Local["identity"], registered: true };
const withReceipt: Local = { ...none, receipt: { inclusionId: "1", nullifier: "1", savedAt: "2026-10-24T00:00:00Z" } as Local["receipt"] };

describe("ownsInvite: Mis votaciones solo muestra las de este dispositivo", () => {
  it("con la credencial o el comprobante en este dispositivo, le pertenece en cualquier fase", () => {
    for (const s of ["registration", "open", "auditable", "drawn"] as const) {
      expect(ownsInvite(invite(s), withIdentity)).toBe(true);
      expect(ownsInvite(invite(s), withReceipt)).toBe(true);
    }
  });

  it("en inscripción: le pertenece si aún no se inscribió o la inscripción sigue en este dispositivo", () => {
    expect(ownsInvite(invite("registration"), none)).toBe(true);
    expect(ownsInvite(invite("registration", { livenessPassedAt: "2026-10-24T00:00:00Z" }), { ...none, pendingFace: "0xabc" })).toBe(true);
  });

  it("rostro comprobado en otro dispositivo: no le pertenece a este", () => {
    expect(ownsInvite(invite("registration", { livenessPassedAt: "2026-10-24T00:00:00Z" }), none)).toBe(false);
  });

  it("votación abierta o cerrada sin credencial ni comprobante aquí: no se muestra", () => {
    for (const s of ["open", "closed", "auditable", "drawn", "failed"] as const) expect(ownsInvite(invite(s), none)).toBe(false);
    expect(ownsInvite(invite("open", { votedAt: "2026-10-24" }), none)).toBe(false);
  });
});
