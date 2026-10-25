import { afterEach, describe, expect, it } from "vitest";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as accessGet, POST as accessPost } from "@/app/api/org/access/route";
import { call, freshStore, sampleElection } from "./helpers";

/** D-25: código de acceso para crear votaciones. Solo aplica si QUORUM_CREATE_CODE está configurado. */
describe("D-25 · código de acceso para crear", () => {
  afterEach(() => {
    delete process.env.QUORUM_CREATE_CODE;
  });

  it("sin QUORUM_CREATE_CODE: no se pide y crear sigue abierto", async () => {
    freshStore();
    delete process.env.QUORUM_CREATE_CODE;
    expect((await call(accessGet)).json).toEqual({ required: false });
    expect((await call(createElection, { body: sampleElection() })).status).toBe(201);
  });

  it("con QUORUM_CREATE_CODE: GET dice required; POST /access y POST /elections exigen el código exacto", async () => {
    freshStore();
    process.env.QUORUM_CREATE_CODE = "platanus-2026";
    expect((await call(accessGet)).json).toEqual({ required: true });
    expect((await call(accessPost, { body: { code: "nope" } })).status).toBe(403);
    expect((await call(accessPost, { body: { code: "platanus-2026" } })).json).toEqual({ ok: true });
    const sinCodigo = await call(createElection, { body: sampleElection() });
    expect(sinCodigo.status).toBe(403);
    expect(sinCodigo.json.code).toBe("forbidden");
    expect((await call(createElection, { body: sampleElection(), headers: { "x-quorum-create-code": "otro" } })).status).toBe(403);
    const ok = await call(createElection, { body: sampleElection(), headers: { "x-quorum-create-code": "platanus-2026" } });
    expect(ok.status).toBe(201);
    expect(JSON.stringify(ok.json)).not.toContain("platanus-2026");
  });
});
