/**
 * Proceso hijo de `load-test.ts --mode continuous`: genera pruebas Semaphore (Groth16) fuera del proceso que mide, para
 * que la CPU de las pruebas no infle las latencias HTTP. (snarkjs usa `web-worker`, que no funciona dentro de
 * worker_threads: por eso es un proceso con IPC.) Recibe { id, privateKey, commitments, electionId, option }.
 */
import { castBallot, defaultArtifacts } from "@quorum/protocol-adapter";

const artifacts = defaultArtifacts();
process.on("message", async (m: { id: number; privateKey: string; commitments: string[]; electionId: string; option: number }) => {
  const t = performance.now();
  try {
    const proof = await castBallot(m.privateKey, m.commitments, m.electionId, m.option, artifacts);
    process.send!({ id: m.id, proof, ms: performance.now() - t });
  } catch (e) {
    process.send!({ id: m.id, error: e instanceof Error ? e.message : String(e), ms: performance.now() - t });
  }
});
